<?php

use App\Http\Controllers\BioUserController;
use App\Http\Controllers\CivilianController;
use App\Http\Controllers\CriminalFlagController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [\App\Http\Controllers\AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/civilians/detect', [CivilianController::class, 'detect']);
    Route::post('/civilians/match', [CivilianController::class, 'match']);
    Route::post('/civilians/generate-embeddings', [CivilianController::class, 'generateEmbeddings']);
    Route::post('/civilians/refresh-health-citizens', [CivilianController::class, 'refreshHealthCitizens']);
    Route::get('/civilians/lookup', [CivilianController::class, 'lookup']);
    Route::apiResource('civilians', CivilianController::class);
    Route::get('/civilians/{civilian}/flags', [CivilianController::class, 'flags']);
    Route::post('/civilians/{civilian}/flags', [CivilianController::class, 'storeFlag']);

    Route::apiResource('criminal-flags', CriminalFlagController::class);

    // Legacy bio_users API intentionally disabled. The active biometric registry uses civilians + criminal_flags.
});