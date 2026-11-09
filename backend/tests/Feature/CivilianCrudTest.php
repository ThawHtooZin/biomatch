<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CivilianCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_complete_the_civilian_crud_flow(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create();
        $token = $admin->createToken('test-token')->plainTextToken;

        $headers = ['Authorization' => "Bearer {$token}"];
        $payload = [
            'nrc_number' => '12/TEST(N)123456',
            'full_name' => 'Ada Lovelace',
            'dob' => '1815-12-10',
            'gender' => 'Female',
            'face_embedding' => [0.12, 0.34, 0.56],
            'photo' => UploadedFile::fake()->image('ada.jpg'),
        ];

        $created = $this->postJson('/api/civilians', $payload, $headers)
            ->assertCreated()
            ->assertJsonPath('nrc_number', '12/TEST(N)123456')
            ->assertJsonPath('face_embedding.0', 0.12)
            ->json('civ_id');

        $this->getJson('/api/civilians?search=Ada', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.full_name', 'Ada Lovelace')
            ->assertJsonPath('has_more', false);

        $this->getJson('/api/civilians?pending_biometrics=false', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.full_name', 'Ada Lovelace');

        $this->getJson('/api/civilians?pending_biometrics=true', $headers)
            ->assertOk()
            ->assertJsonPath('data', []);

        $this->getJson('/api/civilians/lookup?search=Ada', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.nrc_number', '12/TEST(N)123456');

        $this->postJson('/api/civilians', [
            'nrc_number' => '13/TEST(N)123457',
            'full_name' => 'Health Citizen',
            'dob' => now()->subYears(18)->toDateString(),
        ], $headers)->assertCreated();

        $this->postJson('/api/civilians', [
            'nrc_number' => '13/TEST(N)123458',
            'full_name' => 'Thirty Five',
            'dob' => now()->subYears(35)->toDateString(),
        ], $headers)->assertCreated();

        $this->postJson('/api/civilians', [
            'nrc_number' => '13/TEST(N)123459',
            'full_name' => 'Thirty Six',
            'dob' => now()->subYears(36)->toDateString(),
        ], $headers)->assertCreated();

        $this->postJson('/api/civilians/refresh-health-citizens', [], $headers)
            ->assertOk()
            ->assertJsonPath('eligible_added', 2)
            ->assertJsonPath('eligible_total', 2);

        $this->assertDatabaseHas('criminal_flags', [
            'nrc_number' => '13/TEST(N)123457',
            'status' => 'HEALTHY',
            'offense_title' => 'Airport health-service eligibility',
            'gate_action' => 'ALLOW',
        ]);

        $this->getJson('/api/criminal-flags', $headers)
            ->assertOk()
            ->assertJsonFragment([
                'nrc_number' => '13/TEST(N)123457',
                'status' => 'HEALTHY',
                'offense_title' => 'Airport health-service eligibility',
            ]);

        $this->postJson('/api/civilians/refresh-health-citizens', [], $headers)
            ->assertOk()
            ->assertJsonPath('eligible_added', 0)
            ->assertJsonPath('eligible_total', 2);

        $this->getJson('/api/civilians?search=Health', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.has_healthy_flag', true);

        $this->getJson('/api/civilians?search=Thirty', $headers)
            ->assertOk()
            ->assertJsonPath('data.0.has_healthy_flag', true)
            ->assertJsonPath('data.1.has_healthy_flag', false);

        $this->getJson("/api/civilians/{$created}", $headers)
            ->assertOk()
            ->assertJsonPath('full_name', 'Ada Lovelace');

        $this->post("/api/civilians/{$created}", [
            '_method' => 'PUT',
            'nrc_number' => '12/TEST(N)123456',
            'full_name' => 'Ada Byron Lovelace',
            'dob' => '1815-12-10',
            'gender' => 'Female',
            'face_embedding' => [0.9, 0.8],
        ], $headers)
            ->assertOk()
            ->assertJsonPath('full_name', 'Ada Byron Lovelace')
            ->assertJsonPath('face_embedding.1', 0.8);

        $this->deleteJson("/api/civilians/{$created}", [], $headers)
            ->assertOk();

        $this->getJson("/api/civilians/{$created}", $headers)
            ->assertNotFound();
    }
}
