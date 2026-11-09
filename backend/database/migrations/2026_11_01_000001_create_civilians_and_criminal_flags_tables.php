<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS vector;');
        }

        Schema::create('civilians', function (Blueprint $table) {
            $table->string('civ_id', 36)->primary();
            $table->string('nrc_number', 30)->unique();
            $table->string('full_name', 100);
            $table->date('dob');
            $table->string('gender', 10)->nullable();
            $table->string('photo_path')->nullable();
            $table->timestamp('created_at')->useCurrent();

            if (DB::getDriverName() !== 'pgsql') {
                $table->json('face_embedding')->nullable();
            }
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE civilians ADD COLUMN face_embedding vector(512) NULL;');
            DB::statement('CREATE INDEX idx_civilians_face_embedding ON civilians USING hnsw (face_embedding vector_cosine_ops);');
        }

        Schema::create('criminal_flags', function (Blueprint $table) {
            $table->string('flag_id', 36)->primary();
            $table->string('nrc_number', 30);
            $table->enum('status', ['WANTED', 'CURRENTLY_CHARGED', 'CONVICTED', 'TRAVEL_RESTRICTED']);
            $table->string('offense_title', 150);
            $table->boolean('is_wanted_or_restricted')->default(true);
            $table->enum('gate_action', ['INTERCEPT', 'SECONDARY_SCREENING', 'ALLOW']);
            $table->string('issuing_agency', 100);
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('nrc_number')
                ->references('nrc_number')
                ->on('civilians')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('criminal_flags');
        Schema::dropIfExists('civilians');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP EXTENSION IF EXISTS vector;');
        }
    }
};
