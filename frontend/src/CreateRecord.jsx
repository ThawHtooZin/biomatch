import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import api from './api';

const validateCivilianForm = (values) => {
    const errors = {};
    const fullName = values.full_name?.trim();
    const nrcNumber = values.nrc_number?.trim();
    const dobValue = values.dob;

    if (!fullName) {
        errors.full_name = 'Full legal name is required.';
    } else if (fullName.length < 2) {
        errors.full_name = 'Full legal name must be at least 2 characters.';
    }

    if (!nrcNumber) {
        errors.nrc_number = 'National ID number is required.';
    } else if (!/^[0-9]{1,3}\/[A-Z0-9()\- ]+\([A-Z]\)[A-Z0-9\-]+$/.test(nrcNumber)) {
        errors.nrc_number = 'Use a valid NRC format like 12/KAMAYA(N)014984.';
    }

    if (!dobValue) {
        errors.dob = 'Date of birth is required.';
    } else {
        const dobDate = new Date(`${dobValue}T00:00:00`);
        if (Number.isNaN(dobDate.getTime())) {
            errors.dob = 'Enter a valid date of birth.';
        } else if (dobDate > new Date()) {
            errors.dob = 'Date of birth cannot be in the future.';
        }
    }

    if (!['Female', 'Male'].includes(values.gender)) {
        errors.gender = 'Choose a valid sex.';
    }

    if (values.photo) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        const fileName = values.photo.name || '';
        if (!allowedTypes.includes(values.photo.type) && !/\.(jpe?g|png)$/i.test(fileName)) {
            errors.photo = 'Photo must be a JPG or PNG image.';
        }
        if (values.photo.size > 5 * 1024 * 1024) {
            errors.photo = 'Photo must be smaller than 5MB.';
        }
    }

    return errors;
};

export default function CreateRecord() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        nrc_number: '',
        full_name: '',
        dob: '',
        gender: 'Female',
        photo: null,
    });
    const [preview, setPreview] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    const [submitError, setSubmitError] = useState('');

    const getFieldClass = (fieldName) => `w-full p-2 border bg-[#faf9f6] focus:outline-none ${validationErrors[fieldName] ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-gray-400'}`;

    const handleInputChange = (e) => {
        const { name, value, files } = e.target;

        if (files) {
            const selectedFile = files[0];
            setFormData((prev) => ({ ...prev, [name]: selectedFile }));
            setPreview(URL.createObjectURL(selectedFile));
            setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
            return;
        }

        setFormData((prev) => ({ ...prev, [name]: value }));
        setValidationErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError('');

        const errors = validateCivilianForm(formData);
        setValidationErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        const data = new FormData();
        Object.entries(formData).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                data.append(key, value);
            }
        });

        try {
            await api.post('/civilians', data, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            navigate('/dashboard');
        } catch (error) {
            const message = error.response?.data?.message || 'The record could not be saved.';
            const fieldErrors = error.response?.data?.errors || {};
            setValidationErrors((prev) => ({ ...prev, ...fieldErrors }));
            setSubmitError(message);
            console.error('Error creating civilian record.', error.response?.data);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f4f0] font-sans text-gray-800">
            <header className="bg-[#1d3557] text-white p-4 flex items-center shadow-sm">
                <div className="border border-white rounded-full w-9 h-9 flex items-center justify-center mr-4 text-sm font-semibold">R</div>
                <div>
                    <div className="text-xs text-gray-300 tracking-wide">Civil Registry Department</div>
                    <div className="text-xl font-serif font-bold tracking-wide">National Biometric Registry</div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-8">
                <div className="mb-6 flex gap-4">
                    <Link to="/dashboard" className="bg-white text-gray-700 border border-gray-300 px-6 py-2 text-sm font-semibold hover:bg-gray-50 transition-colors">
                        ← Back to Registry
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-6">
                        <div className="bg-white p-6 border border-gray-200 shadow-sm">
                            <h2 className="text-xl font-serif font-bold text-gray-900 mb-5">Civilian profile</h2>

                            {submitError && (
                                <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Full legal name *</label>
                                    <input type="text" name="full_name" value={formData.full_name} required aria-invalid={Boolean(validationErrors.full_name)} onChange={handleInputChange} className={getFieldClass('full_name')} />
                                    {validationErrors.full_name && <p className="mt-1 text-xs text-red-600">{validationErrors.full_name}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">National ID number *</label>
                                    <input type="text" name="nrc_number" value={formData.nrc_number} required placeholder="e.g. 12/KAMAYA(N)014984" aria-invalid={Boolean(validationErrors.nrc_number)} onChange={handleInputChange} className={getFieldClass('nrc_number')} />
                                    {validationErrors.nrc_number && <p className="mt-1 text-xs text-red-600">{validationErrors.nrc_number}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Date of birth *</label>
                                    <input type="date" name="dob" value={formData.dob} required aria-invalid={Boolean(validationErrors.dob)} onChange={handleInputChange} className={getFieldClass('dob')} />
                                    {validationErrors.dob && <p className="mt-1 text-xs text-red-600">{validationErrors.dob}</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Sex</label>
                                    <select name="gender" value={formData.gender} aria-invalid={Boolean(validationErrors.gender)} onChange={handleInputChange} className={getFieldClass('gender')}>
                                        <option value="Female">Female</option>
                                        <option value="Male">Male</option>
                                    </select>
                                    {validationErrors.gender && <p className="mt-1 text-xs text-red-600">{validationErrors.gender}</p>}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 border border-gray-200 shadow-sm">
                            <h2 className="text-xl font-serif font-bold text-gray-900 mb-5">Biometric status</h2>
                            <p className="text-sm text-gray-600">
                                Face embedding is optional for now. The criminal status is managed in a separate tab.
                            </p>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button type="submit" className="bg-[#1d3557] text-white px-6 py-2.5 text-sm font-semibold hover:bg-[#2a4a75] transition-colors shadow-sm">
                                Save civilian
                            </button>
                        </div>
                    </div>

                    <div className="w-full lg:w-80 space-y-6">
                        <div className="bg-white p-6 border border-gray-200 shadow-sm flex flex-col items-center">
                            <label className="w-full h-64 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 bg-[#faf9f6] cursor-pointer hover:bg-gray-50 transition-colors relative overflow-hidden">
                                {preview ? (
                                    <img src={preview} alt="Preview" className="w-full h-full object-cover absolute top-0 left-0" />
                                ) : (
                                    <>
                                        <span className="text-3xl font-light mb-2">+</span>
                                        <span className="text-sm font-medium">Upload photo</span>
                                    </>
                                )}
                                <input type="file" name="photo" accept="image/*" onChange={handleInputChange} className="hidden" />
                            </label>
                            {validationErrors.photo && <p className="mt-2 text-xs text-red-600">{validationErrors.photo}</p>}
                        </div>
                    </div>
                </form>
            </main>
        </div>
    );
}