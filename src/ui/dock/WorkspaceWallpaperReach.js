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
import { SecondaryMonitorDisplay, WorkspacesDisplay } from 'resource:///org/gnome/shell/ui/workspacesView.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Settings } from '../../core/SettingsManager.js';


// GNOME Shell clips each workspace's wallpaper to the work area, which ends
// where the dock begins. Unless the dock is fully opaque, that leaves the strip
// under it still while the workspace zooms, so let the wallpaper grow down to
// the screen edge as the workspace returns to full size. Under an opaque dock
// the extra strip is simply covered.

let injections = null;
let users = 0;

// How far below its work area a monitor's wallpaper may reach: the space a
// bottom dock reserves there, or nothing.
function bottomReach(monitorIndex) {
    if ((Settings.dockPosition || 'BOTTOM') !== 'BOTTOM') return 0;

    const monitor = Main.layoutManager.monitors[monitorIndex];
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    return Math.max(0, monitor.y + monitor.height - (workarea.y + workarea.height));
}

// How far the wallpaper reaches right now, in monitor pixels: all the way with
// the workspace at full size, not at all once the overview has opened.
function currentReach(background) {
    const overviewProgress = Math.min(1, Math.max(0, background._stateAdjustment.value));
    return bottomReach(background._monitorIndex) * (1 - overviewProgress);
}

// The wallpaper is laid out past the workspace's own box, and this box is what
// cuts it off: GNOME's rounded clip only rounds the corners, it does not stop
// the wallpaper above or below them. So keep the box clip, opened downwards.
function syncBoxClip(background) {
    const box = background._bin;
    const reach = currentReach(background);
    if (reach === 0) {
        box.remove_clip();
        box.clip_to_allocation = true;
        return;
    }

    const { width, height } = box;
    box.clip_to_allocation = false;
    box.set_clip(0, 0, width, height + reach * height / background._workarea.height);
}

function updateRoundedClipBounds(original) {
    return function () {
        if (bottomReach(this._monitorIndex) === 0) {
            original.call(this);
            syncBoxClip(this);
            return;
        }

        if (!this._dhruvaBoxClipId)
            this._dhruvaBoxClipId = this._bin.connect('notify::allocation', () => syncBoxClip(this));

        // The corners round at the bounds, so they move down with the reach.
        const monitor = Main.layoutManager.monitors[this._monitorIndex];
        const workarea = this._workarea;
        const rect = new Graphene.Rect();
        rect.origin.x = workarea.x - monitor.x;
        rect.origin.y = workarea.y - monitor.y;
        rect.size.width = workarea.width;
        rect.size.height = workarea.height + currentReach(this);
        this._bgManager.backgroundActor.content.set_rounded_clip_bounds(rect);
        syncBoxClip(this);
    };
}

// GNOME only recomputes the corner radius as the overview moves, not the bounds.
function updateBorderRadius(original) {
    return function () {
        original.call(this);
        this._updateRoundedClipBounds();
    };
}

// Other monitors keep their workspaces inside a box clipped to the work area,
// which stops a sliding workspace from showing on the next monitor. Keep that
// clip at the sides and the top, and only open it downwards.
function reachPastWorkArea(display) {
    const syncClip = () => {
        const reach = bottomReach(display._monitorIndex);
        display.clip_to_allocation = reach === 0;
        if (reach > 0) display.set_clip(0, 0, display.width, display.height + reach);
    };
    display.connect('notify::allocation', syncClip);
    syncClip();
}

function updateWorkspacesViews(original) {
    return function () {
        original.call(this);
        for (const view of this._workspacesViews) {
            if (view instanceof SecondaryMonitorDisplay) reachPastWorkArea(view);
        }
    };
}

export function extendWorkspaceWallpaper() {
    if (users++ > 0) return;

    injections = new InjectionManager();
    injections.overrideMethod(WorkspaceBackground.prototype, '_updateRoundedClipBounds', updateRoundedClipBounds);
    injections.overrideMethod(WorkspaceBackground.prototype, '_updateBorderRadius', updateBorderRadius);
    injections.overrideMethod(WorkspacesDisplay.prototype, '_updateWorkspacesViews', updateWorkspacesViews);
}

export function restoreWorkspaceWallpaper() {
    if (--users > 0) return;

    injections.clear();
    injections = null;
}
