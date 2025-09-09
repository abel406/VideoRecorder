import { useEffect, useRef, useState } from 'react';
import { Button, Group, Stack, Title, Text, Paper, Badge, Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { db } from '../../db/mediaDb';

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isFirefox = () => /Firefox/i.test(navigator.userAgent);

const QUALITY_PRESETS = {
    sd: { label: '480p (SD) ~1.5 Mbps', width: 640, height: 480, vbits: 1_500_000 },
    hd: { label: '720p (HD) ~3 Mbps', width: 1280, height: 720, vbits: 3_000_000 },
    fhd: { label: '1080p (FHD) ~6 Mbps', width: 1920, height: 1080, vbits: 6_000_000 },
    uhd: { label: '2160p (4K) ~16 Mbps', width: 3840, height: 2160, vbits: 16_000_000 },
};

export default function Recorder() {
    const videoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const [stream, setStream] = useState(null);          // null = camera closed
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [mimeType, setMimeType] = useState('');
    const [selectedMime, setSelectedMime] = useState(''); // user selection
    const timerRef = useRef(null);

    // Devices and selections
    const [videoDevices, setVideoDevices] = useState([]);
    const [audioDevices, setAudioDevices] = useState([]);
    const [videoDeviceId, setVideoDeviceId] = useState('');
    const [audioDeviceId, setAudioDeviceId] = useState('');
    const [facing, setFacing] = useState('user'); // 'user' | 'environment'

    // Quality
    const [quality, setQuality] = useState('hd');

    // PWA install helpers (optional)
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isStandalone, setIsStandalone] =
        useState(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

    // Whether we can validate cameras (we got permission at least once)
    const [canValidate, setCanValidate] = useState(false);

    useEffect(() => {
        const onBIP = (e) => { e.preventDefault(); setDeferredPrompt(e); };
        window.addEventListener('beforeinstallprompt', onBIP);

        const mql = window.matchMedia?.('(display-mode: standalone)');
        const onChange = () => setIsStandalone(mql.matches);
        mql?.addEventListener?.('change', onChange);

        // Precompute supported formats
        computeSupportedFormats();

        // Try to list devices (labels appear after permission)
        refreshDevices();

        // Keep device list updated
        const onDevChange = () => refreshDevices();
        navigator.mediaDevices?.addEventListener?.('devicechange', onDevChange);

        return () => {
            stopRecording();
            closeCamera();
            clearInterval(timerRef.current);
            window.removeEventListener('beforeinstallprompt', onBIP);
            navigator.mediaDevices?.removeEventListener?.('devicechange', onDevChange);
            mql?.removeEventListener?.('change', onChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const computeSupportedFormats = () => {
        const candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=h264,aac',
            'video/mp4',
        ];
        const supported = candidates.filter(
            (t) => window.MediaRecorder && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)
        );
        // Set defaults
        setMimeType(supported[0] || 'video/webm');
        setSelectedMime(supported[0] || 'video/webm');
    };

    const deviceOptions = (list) =>
        list.map((d, i) => ({
            value: d.deviceId,
            label: d.label || (d.kind === 'videoinput' ? `Camera ${i + 1}` : `Mic ${i + 1}`),
        }));

    const refreshDevices = async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;

        // If we never asked permission, labels may be blank; do a quick one-shot open/close
        if (!canValidate) {
            try {
                const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                tmp.getTracks().forEach((t) => t.stop());
                setCanValidate(true);
            } catch {
                // ignore; user will grant when opening camera
            }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        // Filter videoinputs: drop 'default'/'communications' and dedupe by label
        let vids = devices.filter((d) => d.kind === 'videoinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId));
        if (isMobile()) {
            // Prefer “real” cameras by label hints on mobile
            const keywords = ['front', 'back', 'rear', 'user', 'environment', 'wide', 'ultra', 'tele', 'camera'];
            const hinted = vids.filter((d) => d.label && keywords.some((k) => d.label.toLowerCase().includes(k)));
            vids = hinted.length ? hinted : vids;
        }
        // Deduplicate by (label || deviceId)
        const seen = new Set();
        vids = vids.filter((d) => {
            const key = d.label || d.deviceId;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Optional: actively validate each camera (after permission) by opening+closing it
        if (canValidate && vids.length <= 4) {
            const ok = [];
            for (const d of vids) {
                try {
                    const test = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: d.deviceId } }, audio: false });
                    test.getTracks().forEach((t) => t.stop());
                    ok.push(d);
                } catch {
                    // skip unusable camera
                }
            }
            vids = ok;
        }

        const auds = devices.filter((d) => d.kind === 'audioinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId));

        setVideoDevices(vids);
        setAudioDevices(auds);

        if (!videoDeviceId && vids[0]) setVideoDeviceId(vids[0].deviceId);
        if (!audioDeviceId && auds[0]) setAudioDeviceId(auds[0].deviceId);
    };

    const buildConstraints = () => {
        const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.hd;
        const baseVideo = {
            width: { ideal: q.width },
            height: { ideal: q.height },
            frameRate: { ideal: 30, max: 60 },
        };
        const video = videoDeviceId
            ? { ...baseVideo, deviceId: { exact: videoDeviceId } }
            : { ...baseVideo, facingMode: { ideal: facing } };
        const audio = audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
        return { video, audio };
    };

    const openCamera = async () => {
        try {
            const s = await navigator.mediaDevices.getUserMedia(buildConstraints());
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
                await videoRef.current.play();
            }
            // After permission, refresh to get labels
            await refreshDevices();
        } catch (err) {
            notifications.show({ color: 'red', title: 'Camera error', message: String(err) });
        }
    };

    const closeCamera = () => {
        if (isRecording) return; // avoid breaking a recording
        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            setStream(null);
            if (videoRef.current) videoRef.current.srcObject = null;
        }
    };

    const startRecording = async () => {
        try {
            const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.hd;

            // Ensure we have a stream (preview opened). If not, open with current constraints.
            let s = stream;
            if (!s) {
                s = await navigator.mediaDevices.getUserMedia(buildConstraints());
                setStream(s);
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    await videoRef.current.play();
                }
            }

            const wanted = selectedMime || mimeType || '';
            const typeToUse = wanted && window.MediaRecorder?.isTypeSupported?.(wanted) ? wanted : pickMimeTypeFallback();
            setMimeType(typeToUse || 'video/webm');
            chunksRef.current = [];

            const mrOpts = typeToUse
                ? { mimeType: typeToUse, videoBitsPerSecond: q.vbits, audioBitsPerSecond: 128_000 }
                : { videoBitsPerSecond: q.vbits, audioBitsPerSecond: 128_000 };
            const mr = new MediaRecorder(s, mrOpts);
            mediaRecorderRef.current = mr;

            mr.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            mr.onstop = async () => {
                try {
                    const blob = new Blob(chunksRef.current, { type: typeToUse || 'video/webm' });
                    const createdAt = new Date();
                    const durationSeconds = duration;
                    await db.recordings.add({
                        createdAt,
                        mimeType: blob.type,
                        bytes: blob.size,
                        durationSeconds,
                        blob,
                    });
                    notifications.show({ title: 'Saved', message: 'Recording saved to Library', autoClose: 2000 });
                } catch (err) {
                    notifications.show({ color: 'red', title: 'Save failed', message: String(err) });
                } finally {
                    setDuration(0);
                }
            };

            mr.start(250);
            setIsRecording(true);
            timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        } catch (err) {
            notifications.show({ color: 'red', title: 'Permission / device error', message: String(err) });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        clearInterval(timerRef.current);
    };

    const flipCamera = async () => {
        if (isRecording) return;
        if (videoDeviceId) return; // when a specific device is chosen, flip is disabled
        setFacing((f) => (f === 'user' ? 'environment' : 'user'));
        if (stream) {
            closeCamera();
            await openCamera();
        }
    };

    const pickMimeTypeFallback = () => {
        const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        for (const t of candidates) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
        }
        return '';
    };

    const format = (s) => {
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${mm}:${ss}`;
    };

    const install = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
        } else if (isFirefox()) {
            notifications.show({
                title: 'Install on Firefox',
                message: 'Open the ⋮ menu → Add to Home screen (or Install).',
            });
        } else {
            notifications.show({
                title: 'Install',
                message: 'Use your browser menu → Install app / Add to Home Screen.',
            });
        }
    };

    // Build selects
    const mimeOptions = (['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=h264,aac', 'video/mp4']
        .filter((t) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(t))
        .map((t) => ({ value: t, label: t })));

    const qualityOptions = Object.entries(QUALITY_PRESETS).map(([k, v]) => ({ value: k, label: v.label }));

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Title order={2}>Record a video</Title>
                {!isStandalone && (
                    <Button variant="light" onClick={install}>
                        Install
                    </Button>
                )}
            </Group>

            <Paper p="md" radius="lg" withBorder>
                <Stack gap="sm" align="center">
                    {/* Format & Quality */}
                    <Group w="100%" grow>
                        <Select
                            label="Video format"
                            data={mimeOptions}
                            value={selectedMime}
                            onChange={(v) => setSelectedMime(v || '')}
                            placeholder="Choose format"
                            withinPortal
                        />
                        <Select
                            label="Quality"
                            data={qualityOptions}
                            value={quality}
                            onChange={(v) => setQuality(v || 'hd')}
                            placeholder="Select quality"
                            withinPortal
                        />
                    </Group>

                    {/* Device pickers */}
                    <Group w="100%" grow>
                        <Select
                            label="Camera"
                            placeholder={videoDevices.length ? 'Select camera' : 'Grant permission to list cameras'}
                            data={deviceOptions(videoDevices)}
                            value={videoDeviceId}
                            onChange={(v) => setVideoDeviceId(v || '')}
                            disabled={isRecording}
                            allowDeselect
                            clearable
                            withinPortal
                        />
                        <Select
                            label="Microphone"
                            placeholder={audioDevices.length ? 'Select mic' : 'Grant permission to list mics'}
                            data={deviceOptions(audioDevices)}
                            value={audioDeviceId}
                            onChange={(v) => setAudioDeviceId(v || '')}
                            disabled={isRecording}
                            allowDeselect
                            clearable
                            withinPortal
                        />
                    </Group>

                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: '100%', maxWidth: 640, borderRadius: 16, background: '#000' }}
                    />

                    <Group gap="md">
                        {/* Open/Close camera */}
                        <Button onClick={openCamera} disabled={!!stream || isRecording}>
                            Open camera
                        </Button>
                        <Button variant="default" onClick={closeCamera} disabled={!stream || isRecording}>
                            Close camera
                        </Button>

                        {/* Record controls */}
                        <Button onClick={startRecording} disabled={isRecording}>
                            Start recording
                        </Button>
                        <Button onClick={stopRecording} color="red" disabled={!isRecording}>
                            Stop & Save
                        </Button>

                        {/* Flip only when not locked to a deviceId */}
                        <Button
                            variant="default"
                            onClick={flipCamera}
                            disabled={!!videoDeviceId || isRecording}
                            title={videoDeviceId ? 'Clear camera selection to enable flip' : 'Flip front/back camera'}
                        >
                            Flip camera
                        </Button>

                        <Badge variant="light">{selectedMime || mimeType || 'format auto'}</Badge>
                        <Text>⏱ {format(duration)}</Text>
                    </Group>

                    <Text size="sm" c="dimmed">
                        Tip: Camera is closed by default. Open it to preview, then start recording. On mobile, only usable cameras are shown.
                    </Text>
                </Stack>
            </Paper>
        </Stack>
    );
}
