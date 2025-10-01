export { };

declare global {
    interface Navigator {
        /** iOS Safari only */
        standalone?: boolean;
    }
}
