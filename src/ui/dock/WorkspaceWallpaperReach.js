/*
* Dhruva GNOME Extension
* Copyright (C) 2026 NarkAgni
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program. If not, see <https://www.gnu.org/licenses/>.
*/



import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WorkspaceBackground } from 'resource:///org/gnome/shell/ui/workspace.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Settings } from '../../core/SettingsManager.js';


// GNOME Shell clips each workspace's wallpaper to the work area, which ends
// where the dock begins. Behind a see-through dock that leaves the strip under
// it still while the workspace zooms, so let the wallpaper grow down to the
// screen edge as the workspace returns to full size.

let injections = null;
let users = 0;

function hasSeeThroughBottomDock() {
    return (Settings.transparentBackground || Settings.transparentInOverview) &&
        (Settings.dockPosition || 'BOTTOM') === 'BOTTOM';
}

function updateRoundedClipBounds(original) {
    return function () {
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        const workarea = this._workarea;
        const bottomStrut = monitor.y + monitor.height - (workarea.y + workarea.height);
        const reaches = bottomStrut > 0 && hasSeeThroughBottomDock();

        // The wallpaper is laid out past the workspace's own box; this clip is
        // what cut it off there, so the rounded bounds take over while reaching.
        this._bin.clip_to_allocation = !reaches;
        if (!reaches) {
            original.call(this);
            return;
        }

        const overviewProgress = Math.min(1, Math.max(0, this._stateAdjustment.value));
        const rect = new Graphene.Rect();
        rect.origin.x = workarea.x - monitor.x;
        rect.origin.y = workarea.y - monitor.y;
        rect.size.width = workarea.width;
        rect.size.height = workarea.height + bottomStrut * (1 - overviewProgress);
        this._bgManager.backgroundActor.content.set_rounded_clip_bounds(rect);
    };
}

// GNOME only recomputes the corner radius as the overview moves, not the bounds.
function updateBorderRadius(original) {
    return function () {
        original.call(this);
        this._updateRoundedClipBounds();
    };
}

export function extendWorkspaceWallpaper() {
    if (users++ > 0) return;

    injections = new InjectionManager();
    injections.overrideMethod(WorkspaceBackground.prototype, '_updateRoundedClipBounds', updateRoundedClipBounds);
    injections.overrideMethod(WorkspaceBackground.prototype, '_updateBorderRadius', updateBorderRadius);
}

export function restoreWorkspaceWallpaper() {
    if (--users > 0) return;

    injections.clear();
    injections = null;
}
