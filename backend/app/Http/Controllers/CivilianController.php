<?php

namespace App\Http\Controllers;

use App\Models\Civilian;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response as ClientResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CivilianController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        if (in_array($request->query('pending_biometrics'), ['true', 'false'], true)) {
            $request->query->set(
                'pending_biometrics',
                $request->query('pending_biometrics') === 'true',
            );
        }

        $validated = $request->validate([
            'search' => 'nullable|string|min:3|max:80',
            'pending_biometrics' => 'nullable|boolean',
            'cursor' => 'nullable|string',
        ]);

        $query = Civilian::query()
            ->select(['civ_id', 'nrc_number', 'full_name', 'dob', 'gender', 'photo_path'])
            ->withExists(['flags as has_healthy_flag' => fn ($query) => $query->where('status', 'HEALTHY')])
            ->selectRaw('face_embedding IS NOT NULL AS has_biometrics');
        if (! empty($validated['search'])) {
            $this->applyCivilianSearch($query, $validated['search']);
        }
        if ($request->boolean('pending_biometrics')) {
            $query->whereNull('face_embedding');
        }

        $page = $query->orderBy('full_name')->orderBy('civ_id')
            ->cursorPaginate(50, ['*'], 'cursor', $validated['cursor'] ?? null);

        return response()->json([
            'data' => $page->items(),
            'next_cursor' => $page->nextCursor()?->encode(),
            'has_more' => $page->hasMorePages(),
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => 'required|string|min:3|max:80',
        ]);

        $query = Civilian::query()->select(['civ_id', 'full_name', 'nrc_number']);
        $this->applyCivilianSearch($query, $validated['search']);

        return response()->json([
            'data' => $query->orderBy('full_name')->orderBy('civ_id')->limit(20)->get(),
        ]);
    }

    public function refreshHealthCitizens(): JsonResponse
    {
        $youngestEligibleDob = today()->subYears(18)->toDateString();
        $oldestEligibleDob = today()->subYears(36)->toDateString();
        if (DB::getDriverName() === 'pgsql') {
            $eligibleAdded = DB::affectingStatement(
                "INSERT INTO criminal_flags (flag_id, nrc_number, status, offense_title, is_wanted_or_restricted, gate_action, created_at)
                SELECT md5(nrc_number || ':HEALTHY'), nrc_number, 'HEALTHY', 'Airport health-service eligibility', FALSE, 'ALLOW', CURRENT_TIMESTAMP FROM civilians
                WHERE dob > ?::date AND dob <= ?::date
                ON CONFLICT (nrc_number) WHERE status = 'HEALTHY' DO NOTHING",
                [$oldestEligibleDob, $youngestEligibleDob],
            );
            $noLongerEligible = DB::affectingStatement(
                "DELETE FROM criminal_flags AS health_flags
                WHERE status = 'HEALTHY' AND NOT EXISTS (
                    SELECT 1 FROM civilians
                    WHERE civilians.nrc_number = health_flags.nrc_number
                    AND civilians.dob > ?::date AND civilians.dob <= ?::date
                )",
                [$oldestEligibleDob, $youngestEligibleDob],
            );
        } else {
            $eligibleAdded = DB::affectingStatement(
                "INSERT OR IGNORE INTO criminal_flags (flag_id, nrc_number, status, offense_title, is_wanted_or_restricted, gate_action, created_at)
                SELECT lower(hex(randomblob(16))), nrc_number, 'HEALTHY', 'Airport health-service eligibility', FALSE, 'ALLOW', CURRENT_TIMESTAMP FROM civilians
                WHERE date(dob) > date(?) AND date(dob) <= date(?)",
                [$oldestEligibleDob, $youngestEligibleDob],
            );
            $noLongerEligible = DB::affectingStatement(
                "DELETE FROM criminal_flags AS health_flags
                WHERE status = 'HEALTHY' AND NOT EXISTS (
                    SELECT 1 FROM civilians
                    WHERE civilians.nrc_number = health_flags.nrc_number
                    AND date(civilians.dob) > date(?) AND date(civilians.dob) <= date(?)
                )",
                [$oldestEligibleDob, $youngestEligibleDob],
            );
        }

        return response()->json([
            'eligible_added' => $eligibleAdded,
            'no_longer_eligible' => $noLongerEligible,
            'eligible_total' => DB::table('criminal_flags')->where('status', 'HEALTHY')->count(),
            'checked_at' => now()->toIso8601String(),
        ]);
    }

    private function applyCivilianSearch(Builder $query, string $search): void
    {
        $term = trim(str_replace(['%', '_'], '', $search));
        if (mb_strlen($term) < 3) {
            $query->whereRaw('1 = 0');

            return;
        }

        $operator = DB::connection()->getDriverName() === 'pgsql' ? 'ILIKE' : 'LIKE';
        $pattern = '%'.$term.'%';

        $query->where(function (Builder $builder) use ($operator, $pattern) {
            $builder->whereRaw("full_name {$operator} ?", [$pattern])
                ->orWhereRaw("nrc_number {$operator} ?", [$pattern]);
        });
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'nrc_number' => ['required', 'string', 'max:30', 'unique:civilians,nrc_number', 'regex:/^[0-9]{1,3}\/[A-Z0-9()\- ]+\([A-Z]\)[A-Z0-9\-]+$/'],
            'full_name' => ['required', 'string', 'min:2', 'max:100'],
            'dob' => ['required', 'date', 'before_or_equal:today'],
            'gender' => ['nullable', 'string', 'in:Female,Male'],
            'photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg', 'max:5120'],
            'face_embedding' => 'nullable|array',
        ]);

        if ($request->hasFile('photo')) {
            $validated['photo_path'] = $request->file('photo')->store('photos', 'public');
        }

        if (isset($validated['face_embedding'])) {
            $validated['face_embedding'] = array_values($validated['face_embedding']);
        }

        $validated['civ_id'] = (string) Str::uuid();

        $civilian = Civilian::create($validated);

        return response()->json($civilian, 201);
    }

    public function show(Civilian $civilian)
    {
        return response()->json($civilian->load('flags'));
    }

    public function update(Request $request, Civilian $civilian)
    {
        $validated = $request->validate([
            'nrc_number' => ['required', 'string', 'max:30', 'unique:civilians,nrc_number,'.$civilian->civ_id.',civ_id', 'regex:/^[0-9]{1,3}\/[A-Z0-9()\- ]+\([A-Z]\)[A-Z0-9\-]+$/'],
            'full_name' => ['required', 'string', 'min:2', 'max:100'],
            'dob' => ['required', 'date', 'before_or_equal:today'],
            'gender' => ['nullable', 'string', 'in:Female,Male'],
            'photo' => ['nullable', 'image', 'mimes:jpeg,png,jpg', 'max:5120'],
            'face_embedding' => 'nullable|array',
        ]);

        if ($request->hasFile('photo')) {
            if ($civilian->photo_path && Storage::disk('public')->exists($civilian->photo_path)) {
                Storage::disk('public')->delete($civilian->photo_path);
            }

            $validated['photo_path'] = $request->file('photo')->store('photos', 'public');
        }

        if (isset($validated['face_embedding'])) {
            $validated['face_embedding'] = array_values($validated['face_embedding']);
        }

        $civilian->update($validated);

        return response()->json($civilian->fresh()->load('flags'));
    }

    public function destroy(Civilian $civilian)
    {
        if ($civilian->photo_path && Storage::disk('public')->exists($civilian->photo_path)) {
            Storage::disk('public')->delete($civilian->photo_path);
        }

        $civilian->delete();

        return response()->json(['message' => 'Civilian deleted.']);
    }

    public function flags(Civilian $civilian)
    {
        return response()->json($civilian->flags()->latest('created_at')->get());
    }

    public function storeFlag(Request $request, Civilian $civilian)
    {
        $validated = $request->validate([
            'status' => 'required|in:WANTED,CURRENTLY_CHARGED,CONVICTED,TRAVEL_RESTRICTED',
            'offense_title' => 'required|string|max:150',
            'is_wanted_or_restricted' => 'nullable|boolean',
            'gate_action' => 'required|in:INTERCEPT,SECONDARY_SCREENING,ALLOW',
        ]);

        $validated['flag_id'] = (string) Str::uuid();
        $validated['nrc_number'] = $civilian->nrc_number;

        $flag = $civilian->flags()->create($validated);

        return response()->json($flag, 201);
    }

    public function detect(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg|max:2048',
        ]);

        $response = $this->forwardCapture($request, 'detect', 15);
        if ($response instanceof JsonResponse) {
            return $response;
        }

        return $this->proxyResponse(
            $response,
            'detection_unavailable',
            'Live face detection is temporarily unavailable. Try again shortly.',
        );
    }

    public function match(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|image|mimes:jpeg,png,jpg|max:5120',
        ]);

        $response = $this->forwardCapture($request, 'match', 45);
        if ($response instanceof JsonResponse) {
            return $response;
        }

        if ($response->failed()) {
            return $this->proxyResponse(
                $response,
                'matching_unavailable',
                'Face matching is temporarily unavailable. Try again shortly.',
            );
        }

        $match = $response->json() ?? [];
        if (! ($match['matched'] ?? false) || empty($match['citizen_id'])) {
            return response()->json($match, $response->status());
        }

        $civilian = Civilian::find($match['citizen_id']);
        if (! $civilian) {
            return response()->json([
                'matched' => false,
                'reason' => 'record_unavailable',
                'message' => 'The matching civilian record is no longer available.',
            ]);
        }

        $flags = $civilian->flags()->latest('created_at')->get()->map(function ($flag) {
            return [
                'flag_id' => $flag->flag_id,
                'status' => $flag->status,
                'offense_title' => $flag->offense_title,
                'is_wanted_or_restricted' => (bool) $flag->is_wanted_or_restricted,
                'gate_action' => $flag->gate_action,
                'created_at' => $flag->created_at,
            ];
        })->all();

        $match['citizen'] = [
            'civ_id' => $civilian->civ_id,
            'full_name' => $civilian->full_name,
            'nrc_number' => $civilian->nrc_number,
            'dob' => $civilian->getRawOriginal('dob'),
            'gender' => $civilian->gender,
            'health_status' => $civilian->flags()->where('status', 'HEALTHY')->exists() ? 'HEALTHY' : null,
            'photo_url' => $civilian->photo_path
                ? asset('storage/'.$civilian->photo_path)
                : null,
            'flags' => $flags,
        ];

        return response()->json($match, $response->status());
    }

    public function generateEmbeddings(): JsonResponse
    {
        try {
            $response = Http::timeout((int) config('services.biometric.generation_timeout', 900))
                ->post(config('services.biometric.url').'/generate-embeddings');
        } catch (ConnectionException) {
            return response()->json([
                'code' => 'biometric_service_unavailable',
                'message' => 'The biometric service is offline. Start it and try again.',
            ], 503);
        }

        return $this->proxyResponse(
            $response,
            'generation_unavailable',
            'Bulk biometric generation could not complete. Try again shortly.',
        );
    }

    private function forwardCapture(Request $request, string $endpoint, int $timeout): ClientResponse|JsonResponse
    {
        try {
            return Http::timeout($timeout)
                ->attach(
                    'image',
                    $request->file('image')->getContent(),
                    $request->file('image')->getClientOriginalName(),
                )
                ->post(config('services.biometric.url').'/'.$endpoint);
        } catch (ConnectionException) {
            return response()->json([
                'code' => 'biometric_service_unavailable',
                'message' => 'The biometric service is offline. Start it and try again.',
            ], 503);
        }
    }

    private function proxyResponse(ClientResponse $response, string $fallbackCode, string $fallbackMessage): JsonResponse
    {
        if ($response->successful()) {
            return response()->json($response->json(), $response->status());
        }

        $knownMessages = [
            'missing_image' => 'Choose an image to scan.',
            'image_too_large' => 'The image is too large. Choose a smaller image.',
            'invalid_image' => 'The image could not be read. Try another image.',
            'no_face_detected' => 'No clear face was found. Center one face and improve the lighting.',
            'detection_unavailable' => 'Live face detection is temporarily unavailable. Try again shortly.',
            'database_unavailable' => 'The biometric database is unavailable. Try again shortly.',
            'database_query_failed' => 'The biometric database could not complete the request. Try again shortly.',
            'embedding_generation_failed' => 'The face could not be processed. Try a clearer image.',
            'embedding_dimension_mismatch' => 'The biometric model returned an incompatible vector. Contact support.',
            'database_write_failed' => 'A biometric vector could not be saved. Try again later.',
        ];
        $downstreamCode = $response->json('code');
        $isKnownError = is_string($downstreamCode) && isset($knownMessages[$downstreamCode]);
        $statusCode = match ($response->status()) {
            413 => 413,
            422 => 422,
            503 => 503,
            default => 502,
        };

        return response()->json([
            'code' => $isKnownError ? $downstreamCode : $fallbackCode,
            'message' => $isKnownError ? $knownMessages[$downstreamCode] : $fallbackMessage,
        ], $statusCode);
    }
}
