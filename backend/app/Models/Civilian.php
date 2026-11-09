<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Civilian extends Model
{
    use HasFactory;

    protected $table = 'civilians';

    public $timestamps = false;

    protected $primaryKey = 'civ_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'civ_id',
        'nrc_number',
        'full_name',
        'dob',
        'gender',
        'photo_path',
        'face_embedding',
    ];

    protected $casts = [
        'dob' => 'date',
        'face_embedding' => 'array',
        'has_healthy_flag' => 'boolean',
    ];

    public function flags()
    {
        return $this->hasMany(CriminalFlag::class, 'nrc_number', 'nrc_number');
    }

    public function getFaceEmbeddingAttribute($value)
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        $trimmed = trim((string) $value, '[]');

        if ($trimmed === '') {
            return [];
        }

        $parts = preg_split('/\s*,\s*|\s+/', $trimmed);
        $parts = array_values(array_filter($parts, fn ($part) => $part !== ''));

        return array_map(function ($part) {
            return is_numeric($part) ? (float) $part : $part;
        }, $parts);
    }

    public function setFaceEmbeddingAttribute($value): void
    {
        if ($value === null) {
            $this->attributes['face_embedding'] = null;

            return;
        }

        if (is_array($value)) {
            $this->attributes['face_embedding'] = '['.implode(',', $value).']';

            return;
        }

        $this->attributes['face_embedding'] = $value;
    }
}
