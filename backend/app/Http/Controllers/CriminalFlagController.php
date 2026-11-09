<?php

namespace App\Http\Controllers;

use App\Models\CriminalFlag;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CriminalFlagController extends Controller
{
    public function index()
    {
        return response()->json(CriminalFlag::with('civilian')->latest('created_at')->get());
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'nrc_number' => 'required|string|exists:civilians,nrc_number',
            'status' => 'required|in:WANTED,CURRENTLY_CHARGED,CONVICTED,TRAVEL_RESTRICTED',
            'offense_title' => 'required|string|max:150',
            'is_wanted_or_restricted' => 'nullable|boolean',
            'gate_action' => 'required|in:INTERCEPT,SECONDARY_SCREENING,ALLOW',
        ]);

        $validated['flag_id'] = (string) Str::uuid();

        $flag = CriminalFlag::create($validated);

        return response()->json($flag, 201);
    }

    public function show(CriminalFlag $criminalFlag)
    {
        return response()->json($criminalFlag->load('civilian'));
    }

    public function update(Request $request, CriminalFlag $criminalFlag)
    {
        if ($criminalFlag->status === 'HEALTHY') {
            return response()->json(['message' => 'Healthy service rows are managed by the eligibility refresh.'], 422);
        }

        $validated = $request->validate([
            'nrc_number' => 'sometimes|string|exists:civilians,nrc_number',
            'status' => 'sometimes|in:WANTED,CURRENTLY_CHARGED,CONVICTED,TRAVEL_RESTRICTED',
            'offense_title' => 'sometimes|string|max:150',
            'is_wanted_or_restricted' => 'nullable|boolean',
            'gate_action' => 'sometimes|in:INTERCEPT,SECONDARY_SCREENING,ALLOW',
        ]);

        $criminalFlag->update($validated);

        return response()->json($criminalFlag->fresh()->load('civilian'));
    }

    public function destroy(CriminalFlag $criminalFlag)
    {
        if ($criminalFlag->status === 'HEALTHY') {
            return response()->json(['message' => 'Healthy service rows are managed by the eligibility refresh.'], 422);
        }

        $criminalFlag->delete();

        return response()->json(['message' => 'Criminal flag deleted.']);
    }
}
