<?php

namespace Database\Factories;

use App\Models\Civilian;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Civilian>
 */
class CivilianFactory extends Factory
{
    protected $model = Civilian::class;

    public function definition(): array
    {
        return [
            'civ_id' => (string) Str::uuid(),
            'nrc_number' => fake()->unique()->numerify('##/TEST(N)######'),
            'full_name' => fake()->name(),
            'dob' => fake()->date(),
            'gender' => fake()->randomElement(['Male', 'Female']),
            'photo_path' => null,
            'face_embedding' => null,
        ];
    }
}