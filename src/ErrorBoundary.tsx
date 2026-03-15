import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, AlertActionCloseButton } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { Page, PageSection } from '@patternfly/react-core/dist/esm/components/Page/index.js';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('Uncaught error:', error, errorInfo);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return (
                <Page>
                    <PageSection>
                        <Alert
                            variant="danger"
                            title="Something went wrong"
                            actionClose={
                                <AlertActionCloseButton
                                    onClose={() => this.setState({ hasError: false, error: null })}
                                />
                            }
                            actionLinks={
                                <Button variant="link" onClick={() => window.location.reload()}>
                                    Reload
                                </Button>
                            }
                        >
                            {this.state.error && <p>{this.state.error.message}</p>}
                        </Alert>
                    </PageSection>
                </Page>
            );
        }

        return this.props.children;
    }
}
