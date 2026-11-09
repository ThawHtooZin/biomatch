<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CriminalFlag extends Model
{
    use HasFactory;

    protected $table = 'criminal_flags';

    public $timestamps = false;

    protected $primaryKey = 'flag_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'flag_id',
        'nrc_number',
        'status',
        'offense_title',
        'is_wanted_or_restricted',
        'gate_action',
    ];

    protected $casts = [
        'is_wanted_or_restricted' => 'boolean',
    ];

    public function civilian()
    {
        return $this->belongsTo(Civilian::class, 'nrc_number', 'nrc_number');
    }
}
