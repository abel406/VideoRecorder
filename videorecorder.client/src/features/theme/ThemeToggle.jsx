import { ActionIcon, Tooltip, useMantineColorScheme, useComputedColorScheme } from '@mantine/core'
import { IconSun, IconMoon } from '@tabler/icons-react' 

export default function ThemeToggle() {
    const { setColorScheme } = useMantineColorScheme()
    const computed = useComputedColorScheme('light', { getInitialValueInEffect: true })
    const isDark = computed === 'dark'

    return (
        <Tooltip label={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
            <ActionIcon
                variant="default"
                radius="xl"
                onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
                aria-label="Toggle color scheme"
            >
                {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            </ActionIcon>
        </Tooltip>
    )
}
