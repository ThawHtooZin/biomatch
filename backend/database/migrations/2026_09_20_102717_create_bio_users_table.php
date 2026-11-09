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
        if (DB::getDriverName() !== 'pgsql') {
            Schema::create('bio_users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->string('nrc_number')->unique();
                $table->string('full_name');
                $table->date('date_of_birth');
                $table->enum('gender', ['Male', 'Female']);
                $table->string('blood_type', 3)->nullable();
                $table->text('address');
                $table->string('photo_path');
                $table->json('face_embedding')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            Schema::dropIfExists('bio_users');
        }
    }
};
