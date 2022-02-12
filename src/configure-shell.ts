'use strict';

import { workspace } from 'vscode';
import { platform } from 'os';

const os = function() {
    switch(platform()) {
        case 'darwin':
            return 'osx';
        case 'linux':
            return 'linux';
    }
    return null;
}();

export function configureShell(): [any, any] {
    if (os) {
        let shellConfig = workspace.getConfiguration('terminal.integrated.automationShell').get(os);
        if (shellConfig) {
            return [shellConfig, workspace.getConfiguration('terminal.integrated.automationShellArgs').get(os)]
        } else {
            let profileConfig = workspace.getConfiguration(`terminal.integrated.automationProfile.${os}`);
            return [profileConfig.get('path'), profileConfig.get('args')];
        }
    } else {
        return [null, null];
    }
}
