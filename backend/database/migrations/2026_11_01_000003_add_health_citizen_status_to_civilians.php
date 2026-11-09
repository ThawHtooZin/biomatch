<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        Schema::table('civilians', function (Blueprint $table) {
            $table->boolean('health_citizen')->default(false);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_health_age_idx ON civilians (health_citizen, dob)');
        } else {
            Schema::table('civilians', function (Blueprint $table) {
                $table->index(['health_citizen', 'dob'], 'civilians_health_age_idx');
            });
        }
    }

    public function down(): void
    {
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
};