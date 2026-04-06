/**
 * Error Boundary Component
 *
 * @description React error boundary that catches rendering errors and displays
 * a graceful fallback UI instead of crashing the entire control.
 */

import * as React from 'react';
import { MessageBar, MessageBarType, Stack, DefaultButton, Text } from '@fluentui/react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error('[FetchXMLQueryBuilder] Unhandled rendering error:', error, info);
    }

    private readonly handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <Stack tokens={{ childrenGap: 12 }} styles={{ root: { padding: 20 } }}>
                    <MessageBar messageBarType={MessageBarType.error} isMultiline>
                        An unexpected error occurred in the FetchXML Query Builder.
                        {this.state.error?.message && (
                            <Text variant="small" block styles={{ root: { marginTop: 4, fontFamily: 'monospace' } }}>
                                {this.state.error.message}
                            </Text>
                        )}
                    </MessageBar>
                    <DefaultButton
                        text="Reset Control"
                        iconProps={{ iconName: 'Refresh' }}
                        onClick={this.handleReset}
                        styles={{ root: { alignSelf: 'flex-start' } }}
                        ariaLabel="Reset the query builder control after an error"
                    />
                </Stack>
            );
        }
        return this.props.children;
    }
}
