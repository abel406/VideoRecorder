import * as React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../db/mediaDb';
import type { Recording} from '../../db/mediaDb';
import {
    ActionIcon,
    Button,
    Card,
    Checkbox,
    Group,
    SegmentedControl,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconDownload, IconTrash } from '@tabler/icons-react';

type View = 'details' | 'cards';
type SortBy = 'name' | 'bytes' | 'createdAt' | 'updatedAt' | 'durationSeconds' | 'mimeType';
type SortDir = 'asc' | 'desc';
/* ---------- helpers ---------- */
const human = (bytes = 0) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fmt = (d: number | Date) => new Date(d).toLocaleString();

function useObjectURL(blob: Blob | null):string |null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        setUrl(u);
        return () => URL.revokeObjectURL(u);
    }, [blob]);
    return url;
}

/* ---------- row pieces ---------- */
function CardsItem({ rec, onDownload, onDelete }: {
    rec: Recording;
    onDownload: (rec: Recording) => void;
    onDelete: (id: number) => void;
}) {
    const url = useObjectURL(rec.blob);
    return (
        <Card withBorder radius="lg" padding="sm">
            <Stack gap="xs">
                <Text size="sm" fw={600} lineClamp={1}>
                    {rec.name ?? `recording-${rec.id}`}
                </Text>
                {url ? (
                    <video
                        controls
                        src={url}
                        preload="metadata"
                        style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 10 }}
                    />
                ) : (
                    <Text c="dimmed">Loading…</Text>
                )}
                <Text size="xs" c="dimmed">
                    {rec.mimeType} • {human(rec.bytes ?? 0)} • {(rec.durationSeconds?? 0) > 0 ? fmtDuration(rec.durationSeconds ?? 0) : '—'}
                </Text>
                <Group justify="apart">
                    <Button size="xs" variant="light" leftSection={<IconDownload size={16} />} onClick={() => onDownload(rec)}>
                        Download
                    </Button>
                    <Button size="xs" color="red" variant="subtle" leftSection={<IconTrash size={16} />} onClick={() => { if (rec.id != null) onDelete(rec.id); }}>
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
}
/* pretty time like 01:23 or 1:02:03 */
const fmtDuration = (sec: number = 0) => {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const two = (n:number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

/* get duration (s) from a Blob by reading video metadata */
async function probeDuration(blob: Blob, { timeoutMs = 6000 }: {timeoutMs?:number} = {}):Promise<number> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;

        const cleanup = () => {
            URL.revokeObjectURL(url);
            video.removeAttribute('src');
            try { video.load(); } catch { /* empty */ }
        };

        const finish = (val: number) => { cleanup(); resolve(val); };
        const fail = (err: Error) => { cleanup(); reject(err); };

        //const done = (val: number|null, err:Error|null) => {
        //    cleanup();
        //    err ? reject(err) : resolve(val);
        //};

        //const timer = setTimeout(() => done(null, new Error('Timeout reading duration')), timeoutMs);

        const timer = setTimeout(() => fail(new Error('Timeout reading duration')), timeoutMs);

        video.addEventListener('loadedmetadata', () => {
            // some containers report 0 / Infinity until a seek
            if (Number.isFinite(video.duration) && video.duration > 0) {
                clearTimeout(timer);
                finish(video.duration);
            } else {
                // force duration calc
                video.currentTime = 1e10;
            }
        }, { once: true });

        video.addEventListener('seeked', () => {
            clearTimeout(timer);
            if (Number.isFinite(video.duration) && video.duration > 0) {
                finish(video.duration);
            } else {
                fail( new Error('Duration not available'));
            }
        }, { once: true });

        video.addEventListener('error', () => {
            clearTimeout(timer);
            fail( new Error('Failed to read metadata'));
        }, { once: true });
    });
}
/* ---------- main ---------- */
export default function Library() {
    const [items, setItems] = useState<Recording[]>([]);
    const [view, setView] = useState<'details' | 'cards'>((localStorage.getItem('lib:view') as 'details' | 'cards') ?? 'details');
    const [sortBy, setSortBy] = useState<'name' | 'bytes' | 'createdAt' | 'updatedAt' | 'durationSeconds' | 'mimeType'>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const load = useCallback(async () => {
        const all = await db.recordings.orderBy('createdAt').reverse().toArray();

        // probe durations that are missing/zero and persist them
        const tasks: Promise<void>[] = [];
        for (const r of all) {
            if (!r.durationSeconds || r.durationSeconds <= 0) {
                tasks.push((async () => {
                    try {
                        const d = await probeDuration(r.blob);
                        if (Number.isFinite(d) && d > 0) {
                            const rounded = Math.round(d);
                            await db.recordings.update(r.id!, {
                                durationSeconds: rounded,
                                updatedAt: Date.now(),
                            });
                            r.durationSeconds = rounded; // update local copy to avoid re-read
                        }
                    } catch { /* ignore */ }
                })());
            }
        }
        if (tasks.length) await Promise.all(tasks);

        setItems(all);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => { localStorage.setItem('lib:view', view); }, [view]);

    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortBy(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => {
        const arr = [...items];
        const key = sortBy;
        arr.sort((a, b) => {
            const av = key === 'name' ? (a.name ?? `recording-${a.id}`) :
                key === 'bytes' ? a.bytes ?? 0 :
                    key === 'durationSeconds' ? a.durationSeconds ?? 0 :
                        key === 'mimeType' ? a.mimeType ?? '' :
                            key === 'updatedAt' ? (a.updatedAt ?? a.createdAt ?? 0) :
                                a.createdAt ?? 0;
            const bv = key === 'name' ? (b.name ?? `recording-${b.id}`) :
                key === 'bytes' ? b.bytes ?? 0 :
                    key === 'durationSeconds' ? b.durationSeconds ?? 0 :
                        key === 'mimeType' ? b.mimeType ?? '' :
                            key === 'updatedAt' ? (b.updatedAt ?? b.createdAt ?? 0) :
                                b.createdAt ?? 0;

            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            const an = av as number;
            const bn = bv as number;
            return sortDir === 'asc' ? an - bn : bn - an;
        });
        return arr;
    }, [items, sortBy, sortDir]);

    const allChecked = selected.size > 0 && sorted.every(r => r.id != null && selected.has(r.id));
    const someChecked = selected.size > 0 && !allChecked;

    const toggleSelectAll = () => {
        if (allChecked) setSelected(new Set());
        else {
            const ids = sorted
                .filter((r): r is Recording & { id: number } => r.id != null) // type guard
                .map((r) => r.id);
            setSelected(new Set(ids));
        }
    };

    const toggleRow = (id: number) => {
        setSelected((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };

    const download = (rec: Recording) => {
        const url = URL.createObjectURL(rec.blob);
        const ext = rec.mimeType?.includes('webm') ? 'webm' : 'mp4';
        const a = document.createElement('a');
        a.href = url;
        a.download = `${rec.name ?? `recording-${rec.id}`}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const remove = async (idOrIds: number | number[]):Promise<void> => {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        await db.recordings.bulkDelete(ids);
        setSelected(new Set());
        await load();
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
                <Title order={2}>Library</Title>
                <SegmentedControl
                    value={view}
                    onChange={(v)=>setView(v as View)}
                    data={[
                        { label: 'Details', value: 'details' },
                        { label: 'Cards', value: 'cards' },
                    ]}
                />
            </Group>

            {/* toolbar */}
            <Group gap="xs">
                <Button
                    variant="light"
                    disabled={selected.size === 0}
                    onClick={() => {
                        const recs = sorted.filter(r => r.id != null && selected.has(r.id));
                        recs.forEach(download);
                    }}
                    leftSection={<IconDownload size={16} />}
                >
                    Download selected ({selected.size})
                </Button>
                <Button
                    color="red"
                    variant="light"
                    disabled={selected.size === 0}
                    onClick={() => remove([...selected])}
                    leftSection={<IconTrash size={16} />}
                >
                    Delete selected
                </Button>
            </Group>

            {items.length === 0 && <Text c="dimmed">No recordings yet.</Text>}

            {view === 'details' ? (
                <Table.ScrollContainer minWidth={900}>
                    <Table striped stickyHeader withTableBorder withColumnBorders>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th w={40}>
                                    <Checkbox
                                        checked={allChecked}
                                        indeterminate={someChecked}
                                        onChange={toggleSelectAll}
                                    />
                                </Table.Th>

                                <Table.Th onClick={() => toggleSort('name')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Name</Text>
                                        {sortBy === 'name' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={120} onClick={() => toggleSort('bytes')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Size</Text>
                                        {sortBy === 'bytes' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={160} onClick={() => toggleSort('createdAt')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Date created</Text>
                                        {sortBy === 'createdAt' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={170} onClick={() => toggleSort('updatedAt')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Date modified</Text>
                                        {sortBy === 'updatedAt' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={120} onClick={() => toggleSort('durationSeconds')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Duration</Text>
                                        {sortBy === 'durationSeconds' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={160} onClick={() => toggleSort('mimeType')} style={{ cursor: 'pointer' }}>
                                    <Group gap={6} wrap="nowrap">
                                        <Text fw={600}>Type</Text>
                                        {sortBy === 'mimeType' && (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />)}
                                    </Group>
                                </Table.Th>

                                <Table.Th w={120}><Text fw={600}>Actions</Text></Table.Th>
                            </Table.Tr>
                        </Table.Thead>

                        <Table.Tbody>
                            {sorted.map((rec) => {
                                const name = rec.name ?? `recording-${rec.id}`;
                                const modified = rec.updatedAt ?? rec.createdAt;
                                return (
                                    <Table.Tr key={rec.id} style={{ userSelect: 'none' }}>
                                        <Table.Td>
                                            <Checkbox checked={rec.id != null && selected.has(rec.id)} onChange={() => { if (rec.id != null) toggleRow(rec.id); }} />
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{name}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{human(rec.bytes ?? 0)}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{fmt(rec.createdAt)}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{fmt(modified)}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{(rec.durationSeconds ?? 0)> 0 ? fmtDuration(rec.durationSeconds) : '—'}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Text>{rec.mimeType}</Text>
                                        </Table.Td>

                                        <Table.Td>
                                            <Group gap="xs">
                                                <Tooltip label="Download">
                                                    <ActionIcon variant="light" onClick={() => download(rec)}>
                                                        <IconDownload size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="Delete">
                                                
                                                    <ActionIcon color="red" variant="light" onClick={() => { if (rec.id != null) toggleRow(rec.id); }}>
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            ) : (
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                    {sorted.map((rec) => (
                        <CardsItem key={rec.id} rec={rec} onDownload={download} onDelete={remove} />
                    ))}
                </SimpleGrid>
            )}
        </Stack>
    );
}
