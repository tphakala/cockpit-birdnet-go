/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2017 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardBody, CardTitle } from '@patternfly/react-core/dist/esm/components/Card/index.js';
import { Button } from '@patternfly/react-core/dist/esm/components/Button/index.js';
import { TextInput } from '@patternfly/react-core/dist/esm/components/TextInput/index.js';
import { Alert } from '@patternfly/react-core/dist/esm/components/Alert/index.js';
import { Flex, FlexItem } from '@patternfly/react-core/dist/esm/layouts/Flex/index.js';

import cockpit from 'cockpit';
import { getDriver } from '../deployment/driver';
import { checkPortAvailable, isPrivilegedPort, validatePort } from '../deployment/ports';
import { defaultSafeSetPortDeps, safeSetPort, type ApplyResult } from '../deployment/safeApply';
import type { Deployment } from '../deployment/types';

const _ = cockpit.gettext;

export interface PortCardProps {
    deployment: Deployment;
    hostname: string;
    onChanged: () => void;
}

export const PortCard: React.FC<PortCardProps> = ({ deployment, hostname, onChanged }) => {
    const driver = getDriver(deployment);
    const caps = driver.getCapabilities();
    const [value, setValue] = useState(String(deployment.hostPort));
    const [available, setAvailable] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ApplyResult | null>(null);

    const port = parseInt(value, 10);
    const valid = validatePort(port);

    useEffect(() => {
        const t = setTimeout(() => setValue(String(deployment.hostPort)), 0);
        return () => clearTimeout(t);
    }, [deployment.hostPort]);

    useEffect(() => {
        if (!valid || port === deployment.hostPort) {
            const t = setTimeout(() => setAvailable(null), 0);
            return () => clearTimeout(t);
        }
        let cancelled = false;
        const t = setTimeout(() => {
            checkPortAvailable(port)
                .then(r => !cancelled && setAvailable(r.free))
                .catch(() => !cancelled && setAvailable(null));
        }, 400);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [port, valid, deployment.hostPort]);

    const apply = async () => {
        setBusy(true);
        setResult(null);
        try {
            const r = await safeSetPort(driver, deployment, port, hostname, defaultSafeSetPortDeps);
            setResult(r);
            if (r.kind === 'applied') onChanged();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardTitle>{_('Network & Port')}</CardTitle>
            <CardBody>
                <p>
                    <strong>{_('Current port:')}</strong> {deployment.hostPort}
                </p>

                {caps.portChangeMode === 'guided-manual' && (
                    <Alert
                        variant="info"
                        isInline
                        isPlain
                        title={
                            deployment.kind === 'docker-compose'
                                ? _('This Docker Compose deployment needs a manual port change')
                                : _('This deployment needs a manual port change')
                        }
                        className="pf-v6-u-mb-md"
                    />
                )}

                <Flex className="pf-v6-u-gap-sm pf-v6-u-align-items-center">
                    <FlexItem>
                        <TextInput
                            aria-label={_('New port')}
                            value={value}
                            type="number"
                            onChange={(_e, v) => setValue(v)}
                        />
                    </FlexItem>
                    <FlexItem>
                        <Button variant="secondary" onClick={() => setValue('80')}>
                            80
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setValue('443')}>
                            443
                        </Button>{' '}
                        <Button variant="secondary" onClick={() => setValue('8080')}>
                            8080
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant="primary"
                            onClick={apply}
                            isLoading={busy}
                            isDisabled={!caps.canChangePort || !valid || busy}
                        >
                            {_('Apply')}
                        </Button>
                    </FlexItem>
                </Flex>

                {valid && isPrivilegedPort(port) && (
                    <Alert
                        variant="warning"
                        isInline
                        isPlain
                        className="pf-v6-u-mt-sm"
                        title={_('Privileged port (below 1024) may require extra host permissions')}
                    />
                )}
                {available === false && (
                    <Alert
                        variant="warning"
                        isInline
                        isPlain
                        className="pf-v6-u-mt-sm"
                        title={_('That port is already in use')}
                    />
                )}
                {available === true && (
                    <Alert
                        variant="success"
                        isInline
                        isPlain
                        className="pf-v6-u-mt-sm"
                        title={_('Port is available')}
                    />
                )}

                {result && result.kind === 'applied' && (
                    <Alert
                        variant="success"
                        isInline
                        className="pf-v6-u-mt-md"
                        title={_('Port changed and service is healthy')}
                    />
                )}
                {result && result.kind === 'rolled-back' && (
                    <Alert variant="danger" isInline className="pf-v6-u-mt-md" title={result.reason} />
                )}
                {result && result.kind === 'precheck-failed' && (
                    <Alert variant="warning" isInline className="pf-v6-u-mt-md" title={result.reason} />
                )}
                {result && result.kind === 'guided-manual' && (
                    <Alert variant="info" isInline className="pf-v6-u-mt-md" title={_('Manual steps required')}>
                        {result.instructions}
                    </Alert>
                )}
            </CardBody>
        </Card>
    );
};
