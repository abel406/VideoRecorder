import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Group, Stack, Title, Text, Paper, Badge, Select } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { db } from '../../db/mediaDb'
import {
  isMobileDevice,
  isStandalone as isStandaloneDisplay,
  isInstallPromptSupported,
} from '../utils/device' // <- adjust if needed

const normalizeLabel = (label) =>
    (label || '')
        .toLowerCase()
        .replace(/\b(camera|webcam)\b/g, '')
        .replace(/\s*\(\d+\)\s*$/g, '')   // strip trailing "(2)" etc.
        .replace(/\s+/g, ' ')
        .trim()
const QUALITY_PRESETS = {
  sd: { label: '480p (SD) ~1.5 Mbps', width: 640, height: 480, vbits: 1_500_000 },
  hd: { label: '720p (HD) ~3 Mbps', width: 1280, height: 720, vbits: 3_000_000 },
  fhd: { label: '1080p (FHD) ~6 Mbps', width: 1920, height: 1080, vbits: 6_000_000 },
  uhd: { label: '2160p (4K) ~16 Mbps', width: 3840, height: 2160, vbits: 16_000_000 },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Recorder() {
  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  const [stream, setStream] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)

  const [mimeType, setMimeType] = useState('')
  const [selectedMime, setSelectedMime] = useState('')

  // discovered devices
  const [videoDevices, setVideoDevices] = useState([])
  const [audioDevices, setAudioDevices] = useState([])

  // proven working cameras (subset)
  const [workingVideo, setWorkingVideo] = useState([]) // [{deviceId,label,facing:null|'user'|'environment'}]
  const [probing, setProbing] = useState(false)

  const [videoDeviceId, setVideoDeviceId] = useState('')
  const [audioDeviceId, setAudioDeviceId] = useState('')
  const [quality, setQuality] = useState('hd')

  useEffect(() => {
    computeSupportedFormats()
    refreshDevices()
    const onDevChange = () => refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', onDevChange)
    return () => {
      stopRecording()
      closeCameraSync()
      clearInterval(timerRef.current)
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDevChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const computeSupportedFormats = () => {
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ]
    const supported = candidates.filter(
      (t) =>
        window.MediaRecorder &&
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(t)
    )
    setMimeType(supported[0] || 'video/webm')
    setSelectedMime(supported[0] || 'video/webm')
  }

  const deviceOptions = (list) =>
    list.map((d, i) => ({
      value: d.deviceId,
      label: d.label || (d.kind === 'videoinput' ? `Camera ${i + 1}` : `Mic ${i + 1}`),
    }))

  const labelFacing = (label) => {
    if (!label) return null
    const s = label.toLowerCase()
    if (/(back|rear|environment)/.test(s)) return 'environment'
    if (/(front|user|selfie)/.test(s)) return 'user'
    return null
  }

  const facingFromTrack = (track) => {
    try {
      const fm = track.getSettings?.().facingMode
      if (fm === 'environment' || fm === 'user') return fm
    } catch {}
    return null
  }

    const probeWorkingVideoDevices = useCallback(async (vids) => {
        setProbing(true)
        const found = []

        for (const d of vids) {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: d.deviceId } },
                    audio: false,
                })
                const track = s.getVideoTracks()[0]
                const settings = track?.getSettings?.() || {}
                const facing = (settings.facingMode === 'environment' || settings.facingMode === 'user')
                    ? settings.facingMode
                    : labelFacing(d.label)

                found.push({
                    deviceId: d.deviceId,
                    label: d.label,
                    facing: facing || null,
                    groupId: settings.groupId || d.groupId || '',   // key for dedup
                })

                s.getTracks().forEach(t => t.stop())
            } catch {
                // skip device that fails to open
            }
        }

        // ---- DEDUPE: keep one per (facing, group) or (facing, normalized label) ----
        const seen = new Set()
        const deduped = []
        for (const cam of found) {
            const key =
                `${cam.facing || 'unknown'}::${cam.groupId || normalizeLabel(cam.label) || cam.deviceId}`
            if (seen.has(key)) continue
            seen.add(key)
            deduped.push(cam)
        }
        // ---------------------------------------------------------------------------

        setWorkingVideo(deduped)

        // choose a sensible default
        if (!videoDeviceId && deduped[0]) {
            // prefer back camera on mobile, otherwise first
            const preferred =
                (isMobileDevice?.() && deduped.find(c => c.facing === 'environment')) || deduped[0]
            setVideoDeviceId(preferred.deviceId)
        }
        setProbing(false)
    }, [videoDeviceId])


  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return

    // Try once so labels populate (only when we have no permission yet)
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      tmp.getTracks().forEach((t) => t.stop())
    } catch {
      // ignore
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    let vids = devices.filter(
      (d) => d.kind === 'videoinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId)
    )

    // dedupe by label/deviceId
    const seen = new Set()
    vids = vids.filter((d) => {
      const key = d.label || d.deviceId
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setVideoDevices(vids)

    const auds = devices.filter(
      (d) => d.kind === 'audioinput' && d.deviceId && !['default', 'communications'].includes(d.deviceId)
    )
    setAudioDevices(auds)
    if (!audioDeviceId && auds[0]) setAudioDeviceId(auds[0].deviceId)

    await probeWorkingVideoDevices(vids)
  }

  const audioOrDefault = () => (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true)

  const buildConstraints = (videoIdOverride) => {
    const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.hd
    const baseVideo = {
      width: { ideal: q.width },
      height: { ideal: q.height },
      frameRate: { ideal: 30, max: 60 },
    }
    const id = videoIdOverride || videoDeviceId
    return id
      ? { video: { ...baseVideo, deviceId: { exact: id } }, audio: audioOrDefault() }
      : { video: baseVideo, audio: audioOrDefault() }
  }

  const explainGetUserMediaError = (err) => {
    const name = err?.name || 'Error'
    let hint = ''
    switch (name) {
      case 'NotAllowedError':
        hint = 'Permission denied. Check Site permissions (Camera & Microphone → Allow).'
        break
      case 'NotFoundError':
        hint = 'No camera found for the selected device.'
        break
      case 'NotReadableError':
        hint = 'Camera is busy. Wait a moment after closing before switching.'
        break
      case 'OverconstrainedError':
        hint = 'Requested constraints not supported by this camera.'
        break
      case 'SecurityError':
        hint = 'Secure context required. Use HTTPS with a trusted certificate.'
        break
      default:
        hint = 'Unexpected camera error.'
    }
    notifications.show({
      color: 'red',
      title: `${name}`,
      message: `${hint} Details: ${err?.message || String(err)}`,
      autoClose: 5000,
    })
  }

  // Open with fallbacks + one retry for "busy" camera
  const tryOpenWithFallbacks = async (videoIdOverride) => {
  const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.hd
  const id = videoIdOverride || videoDeviceId

  const attempt = (config) => navigator.mediaDevices.getUserMedia(config)

  try {
    // 1) id + resolution
    return await attempt(buildConstraints(id))
  } catch (e1) {
    if (id) {
      try {
        // 2) id only (no width/height/framerate)
        return await attempt({ video: { deviceId: { exact: id } }, audio: audioOrDefault() })
      } catch (e2) {

        // === ADD THIS MOBILE FACINGMODE FALLBACK ===
        if (isMobileDevice()) {
          const desiredFacing =
            workingVideo.find(d => d.deviceId === id)?.facing || 'environment'
          try {
            return await attempt({
              video: {
                width: { ideal: q.width },
                height: { ideal: q.height },
                facingMode: { ideal: desiredFacing },
              },
              audio: audioOrDefault(),
            })
          } catch (e3) {
            // continue to final fallback
          }
        }
        // ===========================================

        // 3) final fallback: plain video:true (+ retry if busy)
        try {
          return await attempt({ video: true, audio: audioOrDefault() })
        } catch (e4) {
          if (e2?.name === 'NotReadableError' || e1?.name === 'NotReadableError') {
            await sleep(250)
            return await attempt({ video: true, audio: audioOrDefault() })
          }
          throw e1
        }
      }
    } else {
      // initial open without an explicit id
      // (optional: you can also try facingMode: 'environment' here on mobile)
      try {
        return await attempt(buildConstraints())
      } catch {
        if (isMobileDevice()) {
          try {
            return await attempt({
              video: {
                width: { ideal: q.width },
                height: { ideal: q.height },
                facingMode: { ideal: 'environment' },
              },
              audio: audioOrDefault(),
            })
          } catch {}
        }
        return await attempt({ video: true, audio: audioOrDefault() })
      }
    }
  }
}

  const openCamera = async (videoIdOverride) => {
    try {
      const s = await tryOpenWithFallbacks(videoIdOverride)
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        await videoRef.current.play()
      }
    } catch (err) {
      explainGetUserMediaError(err)
    }
  }

  // Close camera and wait a tiny bit to release hardware (Android/Firefox needs this)
  const closeCameraAsync = async () => {
    if (isRecording) return
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
      if (videoRef.current) videoRef.current.srcObject = null
      await sleep(200)
    }
  }
  const closeCameraSync = () => {
    if (isRecording) return
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }

  const startRecording = async () => {
    try {
      let s = stream
      if (!s) {
        await openCamera(videoDeviceId)
        s = videoRef.current?.srcObject || null
        if (!s) throw new Error('No media stream available')
      }

      const q = QUALITY_PRESETS[quality] || QUALITY_PRESETS.hd
      const wanted = selectedMime || mimeType || ''
      const typeToUse =
        wanted && window.MediaRecorder?.isTypeSupported?.(wanted) ? wanted : pickMimeTypeFallback()
      setMimeType(typeToUse || 'video/webm')
      chunksRef.current = []

      const mr = new MediaRecorder(s, {
        ...(typeToUse ? { mimeType: typeToUse } : {}),
        videoBitsPerSecond: q.vbits,
        audioBitsPerSecond: 128_000,
      })
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: typeToUse || 'video/webm' })
          await db.recordings.add({
            createdAt: new Date(),
            mimeType: blob.type,
            bytes: blob.size,
            durationSeconds: duration,
            blob,
          })
          notifications.show({ title: 'Saved', message: 'Recording saved to Library', autoClose: 2000 })
        } catch (err) {
          notifications.show({ color: 'red', title: 'Save failed', message: String(err) })
        } finally {
          setDuration(0)
        }
      }

      mr.start(250)
      setIsRecording(true)
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } catch (err) {
      notifications.show({ color: 'red', title: 'Permission / device error', message: String(err) })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
    clearInterval(timerRef.current)
  }

  // Flip: if preview open, close+delay+open with the other device; if closed, just switch selection
  const flipCamera = async () => {
    if (isRecording) return
    if (!workingVideo.length) return

    const idx = Math.max(0, workingVideo.findIndex((d) => d.deviceId === videoDeviceId))
    const cur = workingVideo[idx]
    let targetId = ''

    if (cur?.facing && workingVideo.some((d) => d.facing && d.facing !== cur.facing)) {
      const opposite = workingVideo.find((d) => d.facing && d.facing !== cur.facing)
      targetId = opposite?.deviceId || ''
    } else {
      const next = workingVideo[(idx + 1) % workingVideo.length]
      targetId = next?.deviceId || ''
    }
    if (!targetId || targetId === videoDeviceId) return

    setVideoDeviceId(targetId)

    if (stream) {
      await closeCameraAsync()
      await openCamera(targetId)
    }
  }

  const pickMimeTypeFallback = () => {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    for (const t of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t
    }
    return ''
  }

  const format = (s) => {
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

    const workingOptions = workingVideo.map((d, i) => ({
        value: d.deviceId,
        label:
            d.label
                ? d.label
                : d.facing === 'user'
                    ? `Front camera ${i + 1}`
                    : d.facing === 'environment'
                        ? `Back camera ${i + 1}`
                        : `Camera ${i + 1}`,
    }))

  const qualityOptions = Object.entries(QUALITY_PRESETS).map(([k, v]) => ({
    value: k,
    label: v.label,
  }))

  const flipDisabled = isRecording || workingVideo.length < 2
  const flipTitle = workingVideo.length < 2 ? 'Only one usable camera detected' : 'Flip front/back camera'

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Record a video</Title>
        {!isStandaloneDisplay() && !isInstallPromptSupported() && (
          <Text size="sm" c="dimmed">On Safari: Share → Add to Home Screen</Text>
        )}
      </Group>

      <Paper p="md" radius="lg" withBorder>
        <Stack gap="sm" align="center">
          {/* Format & Quality */}
          <Group w="100%" grow>
            <Select
              label="Video format"
              data={[
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm',
                'video/mp4;codecs=h264,aac',
                'video/mp4',
              ]
                .filter((t) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(t))
                .map((t) => ({ value: t, label: t }))}
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
              label={probing ? 'Camera (testing…)' : 'Camera'}
              placeholder={
                workingOptions.length
                  ? 'Select camera'
                  : probing
                  ? 'Testing cameras…'
                  : 'Grant permission to list cameras'
              }
              data={workingOptions}
              value={videoDeviceId}
              onChange={(v) => {
                // Only set selection; DO NOT auto-open. User clicks "Open camera".
                setVideoDeviceId(v || '')
              }}
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
            <Button onClick={() => openCamera(videoDeviceId)} disabled={!!stream || isRecording}>
              Open camera
            </Button>
            <Button variant="default" onClick={closeCameraAsync} disabled={!stream || isRecording}>
              Close camera
            </Button>

            <Button onClick={startRecording} disabled={isRecording}>
              Start recording
            </Button>
            <Button onClick={stopRecording} color="red" disabled={!isRecording}>
              Stop &amp; Save
            </Button>

            <Button variant="default" onClick={flipCamera} disabled={flipDisabled} title={flipTitle}>
              Flip camera
            </Button>

            <Badge variant="light">{selectedMime || mimeType || 'format auto'}</Badge>
            <Text>⏱ {format(duration)}</Text>
          </Group>

          <Text size="sm" c="dimmed">
            Tip: after closing the camera, wait a half second before switching devices on some Android/Firefox phones.
          </Text>
        </Stack>
      </Paper>
    </Stack>
  )
}
