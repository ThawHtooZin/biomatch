import { useEffect, useRef, useState } from 'react';
import api from './api';

const noticeStyles = {
    danger: 'border-red-300 bg-red-50 text-red-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
};

const getCameraNotice = (error) => {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        return { tone: 'warning', title: 'Camera permission needed', message: 'Allow camera access in your browser settings, then try again.' };
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        return { tone: 'warning', title: 'No camera found', message: 'Connect or enable a camera, then try again.' };
    }
    if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
        return { tone: 'warning', title: 'Camera is busy', message: 'Close other apps using the camera and try again.' };
    }

    return { tone: 'danger', title: 'Camera unavailable', message: 'The browser could not start the camera. Check the device connection and try again.' };
};

const getScanNotice = (error) => {
    const code = error?.response?.data?.code;
    const status = error?.response?.status;
    const notices = {
        missing_image: ['warning', 'No image to scan', 'Capture an image before starting the match.'],
        image_too_large: ['warning', 'Image is too large', 'Use a smaller image and try again.'],
        invalid_image: ['warning', 'Image could not be read', 'Retake the picture and make sure it is clear.'],
        no_face_detected: ['warning', 'No clear face found', 'Center one face in view and improve the lighting.'],
        detection_unavailable: ['danger', 'Face detection is offline', 'The biometric service could not check the camera. Try again shortly.'],
        biometric_service_unavailable: ['danger', 'Biometric service is offline', 'The scan service is not responding. Check that it is running, then retry.'],
        database_unavailable: ['danger', 'Registry database unavailable', 'The database could not be reached. Try again shortly.'],
        database_query_failed: ['danger', 'Registry search failed', 'The database could not complete the match. Try again shortly.'],
        embedding_generation_failed: ['warning', 'Face could not be processed', 'Retake the picture with one clear, well-lit face.'],
        embedding_dimension_mismatch: ['danger', 'Biometric model mismatch', 'The biometric service needs attention. Contact support.'],
        record_unavailable: ['warning', 'Record unavailable', 'The matched civilian record could not be loaded.'],
    };

    if (notices[code]) {
        const [tone, title, message] = notices[code];
        return { tone, title, message };
    }
    if (status === 401) return { tone: 'warning', title: 'Session expired', message: 'Sign in again before scanning.' };
    if (status === 413) return { tone: 'warning', title: 'Image is too large', message: 'Use a smaller image and try again.' };
    if (status === 422) return { tone: 'warning', title: 'Image was rejected', message: 'Retake the picture and try again.' };
    if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase().includes('timeout')) {
        return { tone: 'danger', title: 'Scan took too long', message: 'The service did not finish in time. Try again.' };
    }
    if (!error?.response) return { tone: 'danger', title: 'Connection lost', message: 'The registry could not be reached. Check the connection and try again.' };

    return { tone: 'danger', title: 'Scan could not be completed', message: 'An unexpected service problem occurred. Try again; contact support if it continues.' };
};

function ScanNotice({ notice }) {
    if (!notice) return null;

    return (
        <div role={notice.tone === 'danger' ? 'alert' : 'status'} aria-live="polite" className={`border-l-4 p-4 ${noticeStyles[notice.tone] || noticeStyles.info}`}>
            <p className="text-xs font-bold uppercase tracking-wider">{notice.title}</p>
            <p className="mt-1 text-sm leading-5">{notice.message}</p>
        </div>
    );
}

function getFaceBoxStyle(face, video, preview) {
    if (!face || !video?.videoWidth || !preview) return null;

    const scale = Math.max(preview.clientWidth / video.videoWidth, preview.clientHeight / video.videoHeight);
    const offsetX = (preview.clientWidth - video.videoWidth * scale) / 2;
    const offsetY = (preview.clientHeight - video.videoHeight * scale) / 2;

    return {
        left: `${offsetX + face.x * video.videoWidth * scale}px`,
        top: `${offsetY + face.y * video.videoHeight * scale}px`,
        width: `${face.width * video.videoWidth * scale}px`,
        height: `${face.height * video.videoHeight * scale}px`,
    };
}

export default function FaceMatch() {
    const videoRef = useRef(null);
    const previewRef = useRef(null);
    const streamRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isMatching, setIsMatching] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [result, setResult] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [error, setError] = useState(null);
    const [detection, setDetection] = useState(null);
    const [detectionError, setDetectionError] = useState(null);
    const [faceBoxStyle, setFaceBoxStyle] = useState(null);

    const face = detection?.detected ? detection.face : null;
    const faceHeight = face?.height ?? 0;
    const framing = !face ? 'searching' : faceHeight < 0.22 ? 'far' : faceHeight > 0.58 ? 'close' : 'ready';
    const isFaceReady = framing === 'ready';

    useEffect(() => () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        if (capturedImage) URL.revokeObjectURL(capturedImage);
    }, [capturedImage]);

    useEffect(() => {
        if (!isOpen || capturedImage || !cameraReady) return undefined;

        let active = true;
        let timer;

        const scheduleNextFrame = (delay = 700) => {
            timer = window.setTimeout(detectFrame, delay);
        };

        const detectFrame = async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || !video.videoWidth) {
                scheduleNextFrame(250);
                return;
            }

            const sampleWidth = Math.min(video.videoWidth, 640);
            const sampleHeight = Math.round(sampleWidth * video.videoHeight / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = sampleWidth;
            canvas.height = sampleHeight;
            const context = canvas.getContext('2d');
            if (!context) {
                setDetectionError({ tone: 'danger', title: 'Face check unavailable', message: 'This browser could not prepare the camera image. Try another browser.' });
                scheduleNextFrame(2500);
                return;
            }

            context.drawImage(video, 0, 0, sampleWidth, sampleHeight);
            const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
            if (!image) {
                scheduleNextFrame(1000);
                return;
            }

            const data = new FormData();
            data.append('image', image, 'preview.jpg');
            let nextDelay = 700;

            try {
                const response = await api.post('/civilians/detect', data, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                if (active) {
                    setDetection(response.data);
                    setFaceBoxStyle(getFaceBoxStyle(
                        response.data.detected ? response.data.face : null,
                        videoRef.current,
                        previewRef.current,
                    ));
                    setDetectionError(null);
                }
            } catch (requestError) {
                if (active) {
                    setDetection(null);
                    setFaceBoxStyle(null);
                    setDetectionError(getScanNotice(requestError));
                }
                nextDelay = 2500;
            }

            if (active) scheduleNextFrame(nextDelay);
        };

        detectFrame();
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [isOpen, capturedImage, cameraReady]);

    const openCamera = async () => {
        setError(null);
        setDetection(null);
        setDetectionError(null);
        setFaceBoxStyle(null);
        setResult(null);
        setCapturedImage(null);
        setCameraReady(false);
        setIsOpen(true);

        if (!navigator.mediaDevices?.getUserMedia) {
            setError({ tone: 'warning', title: 'Camera requires a secure page', message: 'Open the registry on localhost or HTTPS and allow camera access.' });
            return;
        }

        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            if (videoRef.current) videoRef.current.srcObject = streamRef.current;
            setCameraReady(true);
        } catch (cameraError) {
            setError(getCameraNotice(cameraError));
        }
    };

    const closeCamera = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setCameraReady(false);
        setIsOpen(false);
        setIsMatching(false);
        setDetection(null);
        setFaceBoxStyle(null);
        setCapturedImage(null);
    };

    const retakeCapture = () => {
        setCapturedImage(null);
        setResult(null);
        setError(null);
        openCamera();
    };

    const captureAndMatch = async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !isFaceReady) {
            setError({ tone: 'warning', title: 'Camera is not ready', message: 'Wait until a face is detected before capturing.' });
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            setError({ tone: 'danger', title: 'Capture is unavailable', message: 'This browser could not prepare the image. Try another browser.' });
            return;
        }
        context.drawImage(video, 0, 0);

        const image = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!image) {
            setError({ tone: 'danger', title: 'Picture could not be taken', message: 'The camera did not return an image. Try again.' });
            return;
        }

        setCapturedImage(URL.createObjectURL(image));
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setCameraReady(false);

        const data = new FormData();
        data.append('image', image, 'capture.jpg');
        setIsMatching(true);
        setError(null);

        try {
            const response = await api.post('/civilians/match', data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setResult(response.data);
        } catch (requestError) {
            setError(getScanNotice(requestError));
        } finally {
            setIsMatching(false);
        }
    };

    return (
        <>
            <button type="button" onClick={openCamera} className="bg-[#b59a6d] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#9d855d]">Match face</button>

            {isOpen && (
                <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
                    <div className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto border-t-4 border-[#b59a6d] bg-white p-4 shadow-xl sm:p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b59a6d]">Security checkpoint</p>
                                <h2 className="text-2xl font-serif font-bold text-gray-900">Live face match</h2>
                            </div>
                            <button type="button" onClick={closeCamera} className="text-gray-500 hover:text-gray-900" aria-label="Close camera">Close</button>
                        </div>

                        <div className={capturedImage
                            ? 'grid items-start gap-4 grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[7rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)]'
                            : 'grid gap-5 lg:grid-cols-[1.15fr_0.85fr]'}>
                            <div ref={previewRef} className={`relative overflow-hidden bg-[#070b0e] ${capturedImage ? 'aspect-3/4 w-full' : 'aspect-video w-full'}`}>
                                {capturedImage ? <img src={capturedImage} alt="Captured face" className="h-full w-full object-cover" /> : <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />}
                                {capturedImage && isMatching && <span aria-hidden="true" className="biometric-scan-line pointer-events-none absolute left-0 right-0 h-px bg-cyan-100 shadow-[0_0_10px_2px_rgba(165,243,252,0.8)]" />}
                                {!capturedImage && faceBoxStyle && (
                                    <div className={`pointer-events-none absolute border-2 transition-all duration-200 ${isFaceReady ? 'border-emerald-400 shadow-[0_0_18px_3px_rgba(52,211,153,0.35)]' : 'border-amber-400 shadow-[0_0_18px_3px_rgba(251,191,36,0.25)]'}`} style={faceBoxStyle}>
                                        <span className={`absolute -top-6 left-0 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-white ${isFaceReady ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                                            {isFaceReady ? 'READY TO SCAN' : framing === 'far' ? 'MOVE CLOSER' : 'MOVE BACK'}
                                        </span>
                                    </div>
                                )}
                                {!capturedImage && <span className="absolute bottom-3 left-4 bg-black/70 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-white">{isFaceReady ? 'FACE IN RANGE' : 'LIVE FACE CHECK'}</span>}
                                {capturedImage && <span className="absolute bottom-3 left-4 bg-black/70 px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-emerald-300">PICTURE TAKEN</span>}
                            </div>

                            <div className="min-w-0 min-h-full border border-gray-200 bg-[#faf9f6] p-3 sm:p-5">
                                {error && <ScanNotice notice={error} />}
                                {!error && !result && !isMatching && detectionError && <ScanNotice notice={detectionError} />}
                                {!error && !result && !isMatching && !detectionError && (
                                    <div className="flex h-full min-h-48 flex-col justify-center">
                                        <p className={`text-xs font-semibold uppercase tracking-widest ${isFaceReady ? 'text-emerald-700' : detection?.detected === false ? 'text-amber-700' : 'text-gray-600'}`}>
                                            {detection?.detected === false ? 'No face detected' : isFaceReady ? 'Face detected' : 'Live face check'}
                                        </p>
                                        <h3 className="mt-2 text-xl font-serif font-bold text-gray-900">
                                            {framing === 'far' ? 'Move closer to the camera' : framing === 'close' ? 'Move back a little' : isFaceReady ? 'Face is in scanning range' : 'Position one face in view'}
                                        </h3>
                                        <p className="mt-2 text-sm leading-6 text-gray-600">
                                            {detection?.message || (framing === 'far' ? 'The face is too small to scan clearly.' : framing === 'close' ? 'Move back until your full face fits comfortably in the view.' : isFaceReady ? 'Hold still and capture when ready.' : 'Center your face and make sure it is well lit.')}
                                        </p>
                                    </div>
                                )}
                                {isMatching && (
                                    <div role="status" aria-live="polite" className="flex min-h-48 flex-col justify-center">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Biometric search in progress</p>
                                            <h3 className="mt-2 text-xl font-serif font-bold text-gray-900 sm:text-2xl">Searching civilian registry</h3>
                                            <p className="mt-2 text-sm leading-6 text-gray-600">Comparing the captured face with registered profiles.</p>
                                            <div aria-hidden="true" className="mt-3 flex gap-1.5"><span className="h-1.5 w-1.5 animate-pulse bg-emerald-700 motion-reduce:animate-none" /><span className="h-1.5 w-1.5 animate-pulse bg-emerald-700 [animation-delay:180ms] motion-reduce:animate-none" /><span className="h-1.5 w-1.5 animate-pulse bg-emerald-700 [animation-delay:360ms] motion-reduce:animate-none" /></div>
                                        </div>
                                    </div>
                                )}
                                {result?.matched && result.citizen && (
                                    <div>
                                        <div className="mb-4 flex min-w-0 items-start gap-3 border-b border-green-200 pb-4">
                                            {result.citizen.photo_url && <img src={result.citizen.photo_url} alt="Registered civilian" className="h-14 w-14 shrink-0 object-cover sm:h-16 sm:w-16" />}
                                            <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Identity verified</p>
                                                    <h3 className="mt-1 wrap-break-word text-xl font-serif font-bold leading-tight text-gray-900 sm:text-2xl">{result.citizen.full_name}</h3>
                                                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Civilian ID</p>
                                                    <p className="break-all text-xs leading-4 text-gray-600">{result.citizen.civ_id}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                                            <div><span className="text-gray-500">NRC number</span><p className="mt-0.5 wrap-break-word text-base font-semibold text-gray-900">{result.citizen.nrc_number}</p></div>
                                            <div><span className="text-gray-500">Date of birth</span><p className="mt-0.5 text-base font-semibold text-gray-900">{result.citizen.dob || 'Not recorded'}</p></div>
                                            <div><span className="text-gray-500">Gender</span><p className="mt-0.5 text-base font-semibold text-gray-900">{result.citizen.gender || 'Not recorded'}</p></div>
                                            <div><span className="text-gray-500">Airport health check</span><p className={`mt-0.5 text-base font-semibold ${result.citizen.health_status === 'HEALTHY' ? 'text-emerald-800' : 'text-gray-700'}`}>{result.citizen.health_status || 'No healthy flag'}</p></div>
                                        </div>

                                        {Array.isArray(result.citizen.flags) && result.citizen.flags.length > 0 ? (
                                            <div className="mt-5 border-t border-gray-200 pt-4">
                                                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-700">Criminal flags</p>
                                                {result.citizen.flags.map((flag) => (
                                                    <div key={flag.flag_id} className="mb-2 border border-red-200 bg-red-50 p-3 text-sm">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="font-bold text-red-800">{flag.status.replaceAll('_', ' ')}</span>
                                                            <span className="max-w-full wrap-break-word bg-red-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">{flag.gate_action.replaceAll('_', ' ')}</span>
                                                        </div>
                                                        <p className="mt-2 text-base font-medium text-gray-900">{flag.offense_title}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-4 border-t border-gray-200 pt-3">
                                                <p className="text-xs font-semibold uppercase tracking-wider text-green-700">No criminal flag</p>
                                                <p className="mt-1 text-sm text-gray-600">This matched civilian does not currently have an active criminal record.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {result?.matched && !result.citizen && <ScanNotice notice={{ tone: 'warning', title: 'Record unavailable', message: 'The matched civilian record could not be loaded.' }} />}
                                {result && !result.matched && (
                                    <ScanNotice notice={result.reason === 'no_biometrics'
                                        ? { tone: 'info', title: 'No biometrics in the registry', message: 'Generate biometric profiles before attempting a match.' }
                                        : { tone: 'warning', title: 'No matching civilian found', message: 'The captured face did not match a generated profile.' }} />
                                )}
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end gap-3">
                            {capturedImage && !isMatching && <button type="button" onClick={retakeCapture} className="mr-auto border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Retake</button>}
                            <button type="button" onClick={closeCamera} className="border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={captureAndMatch} disabled={!isFaceReady || isMatching || Boolean(capturedImage)} className="bg-[#1d3557] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2a4a75] disabled:opacity-50">
                                {isMatching ? 'Matching...' : capturedImage ? 'Captured' : 'Capture and match'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}