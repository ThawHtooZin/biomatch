<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        Schema::create('civilian_health_flags', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('nrc_number', 30)->unique();
            $table->string('status', 20)->default('HEALTHY');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('nrc_number')->references('nrc_number')->on('civilians')->cascadeOnDelete();
        });

        DB::statement("INSERT INTO civilian_health_flags (nrc_number, status, created_at)
            SELECT nrc_number, 'HEALTHY', CURRENT_TIMESTAMP FROM civilians WHERE health_citizen = TRUE");

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS civilians_health_age_idx');
        } else {
            Schema::table('civilians', function (Blueprint $table) {
                $table->dropIndex('civilians_health_age_idx');
            });
        }

        Schema::table('civilians', function (Blueprint $table) {
            $table->dropColumn('health_citizen');
        });
    }

    public function down(): void
    {
        Schema::table('civilians', function (Blueprint $table) {
            $table->boolean('health_citizen')->default(false);
        });

        DB::statement("UPDATE civilians SET health_citizen = TRUE WHERE nrc_number IN (
            SELECT nrc_number FROM civilian_health_flags WHERE status = 'HEALTHY'
        )");

        Schema::dropIfExists('civilian_health_flags');

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_health_age_idx ON civilians (health_citizen, dob)');
        } else {
            Schema::table('civilians', function (Blueprint $table) {
                $table->index(['health_citizen', 'dob'], 'civilians_health_age_idx');
            });
        }
    }
};