<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        Schema::table('criminal_flags', function (Blueprint $table) {
            $table->dropColumn('issuing_agency');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_name_cursor_idx ON civilians (full_name, civ_id)');
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_pending_name_cursor_idx ON civilians (full_name, civ_id) WHERE face_embedding IS NULL');
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_name_search_idx ON civilians USING gin (full_name gin_trgm_ops)');
            DB::statement('CREATE INDEX CONCURRENTLY IF NOT EXISTS civilians_nrc_search_idx ON civilians USING gin (nrc_number gin_trgm_ops)');
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS civilians_name_cursor_idx');
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS civilians_pending_name_cursor_idx');
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS civilians_name_search_idx');
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS civilians_nrc_search_idx');
        }

        Schema::table('criminal_flags', function (Blueprint $table) {
            $table->string('issuing_agency', 100)->nullable();
        });
    }
};