<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class BioUser extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'nrc_number',
        'full_name',
        'date_of_birth',
        'gender',
        'blood_type',
        'address',
        'photo_path',
        'face_embedding',
    ];

    protected $casts = [
        'face_embedding' => 'array',
    ];

    public static function tableName(): string
    {
        return DB::getDriverName() === 'pgsql' ? 'civilians' : 'bio_users';
    }

    public function getTable()
    {
        return self::tableName();
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