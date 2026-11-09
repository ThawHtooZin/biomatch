<?php

namespace App\Http\Controllers;

use App\Models\BioUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BioUserController extends Controller
{
    public function index()
    {
        return response()->json(BioUser::latest()->get());
    }

    public function store(Request $request)
    {
        $table = BioUser::tableName();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:'.$table.',email',
            'nrc_number' => 'required|string|max:255|unique:'.$table.',nrc_number',
            'full_name' => 'required|string|max:255',
            'date_of_birth' => 'required|date',
            'gender' => 'required|in:Male,Female',
            'blood_type' => 'nullable|string|max:3',
            'address' => 'required|string',
            'face_embedding' => 'nullable|json',
            'photo' => 'required|image|mimes:jpeg,png,jpg|max:5120',
        ]);

        $photoPath = $request->file('photo')->store('photos', 'public');
        $attributes = $validated;
        unset($attributes['photo']);
        $attributes['photo_path'] = $photoPath;
        $attributes['face_embedding'] = $this->decodeFaceEmbedding($attributes['face_embedding'] ?? null);

        if ($table === 'civilians') {
            $attributes['civ_id'] = (string) Str::uuid();
            $attributes['dob'] = $attributes['date_of_birth'];
            unset($attributes['date_of_birth'], $attributes['blood_type'], $attributes['address'], $attributes['name'], $attributes['email']);
        }

        $user = BioUser::create($attributes);

        return response()->json($user, 201);
    }

    public function show(BioUser $bioUser)
    {
        return response()->json($bioUser);
    }

    public function update(Request $request, BioUser $bioUser)
    {
        $table = BioUser::tableName();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:'.$table.',email,'.$bioUser->id,
            'nrc_number' => 'required|string|max:255|unique:'.$table.',nrc_number,'.$bioUser->id,
            'full_name' => 'required|string|max:255',
            'date_of_birth' => 'required|date',
            'gender' => 'required|in:Male,Female',
            'blood_type' => 'nullable|string|max:3',
            'address' => 'required|string',
            'face_embedding' => 'nullable|json',
            'photo' => 'nullable|image|mimes:jpeg,png,jpg|max:5120',
        ]);

        if ($request->hasFile('photo')) {
            if (Storage::disk('public')->exists($bioUser->photo_path)) {
                Storage::disk('public')->delete($bioUser->photo_path);
            }
            $validated['photo_path'] = $request->file('photo')->store('photos', 'public');
        }

        unset($validated['photo']);
        if (array_key_exists('face_embedding', $validated)) {
            $validated['face_embedding'] = $this->decodeFaceEmbedding($validated['face_embedding']);
        }

        if ($table === 'civilians') {
            $validated['dob'] = $validated['date_of_birth'];
            unset($validated['date_of_birth'], $validated['blood_type'], $validated['address'], $validated['name'], $validated['email']);
        }

        $bioUser->update($validated);

        return response()->json($bioUser);
    }

    public function destroy(BioUser $bioUser)
    {
        if ($bioUser->photo_path && Storage::disk('public')->exists($bioUser->photo_path)) {
            Storage::disk('public')->delete($bioUser->photo_path);
        }
        $bioUser->delete();

        return response()->json(['message' => 'Record deleted.']);
    }

    private function decodeFaceEmbedding(?string $faceEmbedding): ?array
    {
        if ($faceEmbedding === null || $faceEmbedding === '') {
            return null;
        }

        return json_decode($faceEmbedding, true, 512, JSON_THROW_ON_ERROR);
    }
}
