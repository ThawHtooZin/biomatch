<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public $withinTransaction = false;

    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE criminal_flags DROP CONSTRAINT IF EXISTS criminal_flags_status_check');
            DB::statement("ALTER TABLE criminal_flags ADD CONSTRAINT criminal_flags_status_check CHECK (status IN ('WANTED', 'CURRENTLY_CHARGED', 'CONVICTED', 'TRAVEL_RESTRICTED', 'HEALTHY'))");
            DB::statement("INSERT INTO criminal_flags (flag_id, nrc_number, status, offense_title, is_wanted_or_restricted, gate_action, created_at)
                SELECT md5(nrc_number || ':HEALTHY'), nrc_number, 'HEALTHY', 'Airport health-service eligibility', FALSE, 'ALLOW', created_at
                FROM civilian_health_flags");
            DB::statement("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS criminal_flags_healthy_nrc_unique ON criminal_flags (nrc_number) WHERE status = 'HEALTHY'");
        } else {
            Schema::table('criminal_flags', function (Blueprint $table) {
                $table->string('status', 32)->change();
            });
            DB::statement("INSERT OR IGNORE INTO criminal_flags (flag_id, nrc_number, status, offense_title, is_wanted_or_restricted, gate_action, created_at)
                SELECT lower(hex(randomblob(16))), nrc_number, 'HEALTHY', 'Airport health-service eligibility', FALSE, 'ALLOW', created_at
                FROM civilian_health_flags");
            DB::statement("CREATE UNIQUE INDEX criminal_flags_healthy_nrc_unique ON criminal_flags (nrc_number) WHERE status = 'HEALTHY'");
        }

        Schema::dropIfExists('civilian_health_flags');
    }

    public function down(): void
    {
        Schema::create('civilian_health_flags', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('nrc_number', 30)->unique();
            $table->string('status', 20)->default('HEALTHY');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('nrc_number')->references('nrc_number')->on('civilians')->cascadeOnDelete();
        });

        DB::table('civilian_health_flags')->insertUsing(
            ['nrc_number', 'status', 'created_at'],
            DB::table('criminal_flags')->select(['nrc_number', 'status', 'created_at'])->where('status', 'HEALTHY'),
        );
        DB::table('criminal_flags')->where('status', 'HEALTHY')->delete();

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('DROP INDEX CONCURRENTLY IF EXISTS criminal_flags_healthy_nrc_unique');
            DB::statement('ALTER TABLE criminal_flags DROP CONSTRAINT IF EXISTS criminal_flags_status_check');
            DB::statement("ALTER TABLE criminal_flags ADD CONSTRAINT criminal_flags_status_check CHECK (status IN ('WANTED', 'CURRENTLY_CHARGED', 'CONVICTED', 'TRAVEL_RESTRICTED'))");
        } else {
            DB::statement('DROP INDEX IF EXISTS criminal_flags_healthy_nrc_unique');
            Schema::table('criminal_flags', function (Blueprint $table) {
                $table->enum('status', ['WANTED', 'CURRENTLY_CHARGED', 'CONVICTED', 'TRAVEL_RESTRICTED'])->change();
            });
        }
    }
};