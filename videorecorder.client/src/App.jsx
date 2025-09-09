import { AppShell, Burger, Group, NavLink, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Recorder from './features/recorder/Recorder.jsx';
import Library from './features/library/Library.jsx';
import ThemeToggle from './features/theme/ThemeToggle';
import InstallButton from './features/pwa/InstallButton.jsx'

export default function App() {
    const [opened, { toggle }] = useDisclosure();
    const { pathname } = useLocation();

    return (
       <center>
        <AppShell
            header={{ height: 56 }}
            navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
            padding="md"
            align="center"
            grow
        >
            <AppShell.Header>
                    <Group h="100%" px="md" justify="space-between">
                        <Group>
                            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                            <Title order={3}>Video Recorder</Title>
                        </Group>

                        <Group>
                            <ThemeToggle />
                            <InstallButton />
                        </Group>                        
                    </Group>
            </AppShell.Header>

            <AppShell.Navbar p="md">
                <NavLink
                    component={Link}
                    to="/record"
                    label="Record"
                    active={pathname.startsWith('/record')}
                />
                <NavLink
                    component={Link}
                    to="/library"
                    label="Library"
                    active={pathname.startsWith('/library')}
                />
            </AppShell.Navbar>

            <AppShell.Main>
                <Routes>
                    <Route path="/" element={<Navigate to="/record" replace />} />
                    <Route path="/record" element={<Recorder />} />
                    <Route path="/library" element={<Library />} />
                </Routes>
            </AppShell.Main>
            </AppShell>
        </center>
    );
}