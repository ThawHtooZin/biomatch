<?php

namespace Tests\Feature;

use App\Models\Civilian;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CivilianBiometricTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_request_face_detection(): void
    {
        Http::fake([
            'http://127.0.0.1:5001/detect' => Http::response([
                'detected' => true,
                'face' => ['x' => 0.25, 'y' => 0.2, 'width' => 0.3, 'height' => 0.4],
                'confidence' => 0.98,
            ]),
        ]);

        $headers = $this->authenticatedHeaders();

        $this->post('/api/civilians/detect', [
            'image' => UploadedFile::fake()->image('frame.jpg', 640, 480),
        ], $headers)
            ->assertOk()
            ->assertJsonPath('detected', true)
            ->assertJsonPath('face.height', 0.4);

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:5001/detect'
            && $request->hasFile('image'));
    }

    public function test_scan_errors_are_returned_with_safe_messages(): void
    {
        Http::fake([
            'http://127.0.0.1:5001/detect' => Http::response([
                'code' => 'no_face_detected',
                'message' => 'internal exception details should not escape',
            ], 422),
        ]);

        $this->post('/api/civilians/detect', [
            'image' => UploadedFile::fake()->image('frame.jpg', 640, 480),
        ], $this->authenticatedHeaders())
            ->assertUnprocessable()
            ->assertJsonPath('code', 'no_face_detected')
            ->assertJsonPath('message', 'No clear face was found. Center one face and improve the lighting.');
    }

    public function test_authenticated_user_can_match_a_civilian_from_postgres_results(): void
    {
        Storage::fake('public');
        $civilian = Civilian::factory()->create([
            'full_name' => 'Security Civilian',
            'nrc_number' => '12/SECURITY(N)123456',
            'photo_path' => 'photos/civilian.jpg',
        ]);

        Http::fake([
            'http://127.0.0.1:5001/match' => Http::response([
                'matched' => true,
                'citizen_id' => $civilian->civ_id,
                'distance' => 0.18,
                'threshold' => 0.55,
            ]),
        ]);

        $this->post('/api/civilians/match', [
            'image' => UploadedFile::fake()->image('capture.jpg'),
        ], $this->authenticatedHeaders())
            ->assertOk()
            ->assertJsonPath('matched', true)
            ->assertJsonPath('citizen_id', $civilian->civ_id)
            ->assertJsonPath('citizen.civ_id', $civilian->civ_id)
            ->assertJsonPath('citizen.full_name', $civilian->full_name)
            ->assertJsonPath('citizen.nrc_number', $civilian->nrc_number)
            ->assertJsonMissingPath('citizen.face_embedding');

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:5001/match'
            && $request->hasFile('image'));
    }

    public function test_authenticated_user_can_generate_pending_civilian_embeddings(): void
    {
        Http::fake([
            'http://127.0.0.1:5001/generate-embeddings' => Http::response([
                'total' => 2,
                'generated' => 1,
                'skipped' => 0,
                'failed' => 1,
                'failures' => [[
                    'civ_id' => 'civilian-id',
                    'full_name' => 'No Photo Civilian',
                    'code' => 'photo_missing',
                    'message' => 'No photo is saved for this civilian.',
                ]],
            ]),
        ]);

        $this->postJson('/api/civilians/generate-embeddings', [], $this->authenticatedHeaders())
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('generated', 1)
            ->assertJsonPath('failed', 1)
            ->assertJsonPath('failures.0.code', 'photo_missing');
    }

    public function test_invalid_civilian_records_are_rejected_with_clear_validation_errors(): void
    {
        $this->postJson('/api/civilians', [
            'nrc_number' => 'bad-format',
            'full_name' => 'A',
            'dob' => now()->addDay()->toDateString(),
            'gender' => 'Unknown',
        ], $this->authenticatedHeaders())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['nrc_number', 'full_name', 'dob', 'gender']);
    }

    private function authenticatedHeaders(): array
    {
        $admin = User::factory()->create();

        return ['Authorization' => 'Bearer '.$admin->createToken('biometric-test')->plainTextToken];
    }
}