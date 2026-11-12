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



import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { WorkspaceBackground } from 'resource:///org/gnome/shell/ui/workspace.js';
import { SecondaryMonitorDisplay, WorkspacesDisplay } from 'resource:///org/gnome/shell/ui/workspacesView.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';


// GNOME Shell clips each workspace's wallpaper to the work area, which ends
// where the dock and the top bar begin. Unless those are fully opaque, that
// leaves the strips behind them still while the workspace zooms, so let the
// wallpaper grow out to the screen edges as the workspace returns to full
// size. Behind an opaque bar the extra strip is simply covered.

let injections = null;
let users = 0;

// The space reserved on each side of a monitor, between its work area and its edges.
function reservedSpace(monitorIndex) {
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const workarea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
    return {
        workarea,
        left: Math.max(0, workarea.x - monitor.x),
        top: Math.max(0, workarea.y - monitor.y),
        right: Math.max(0, monitor.x + monitor.width - (workarea.x + workarea.width)),
        bottom: Math.max(0, monitor.y + monitor.height - (workarea.y + workarea.height)),
    };
}

// How far the wallpaper reaches right now, in monitor pixels: all the way with
// the workspace at full size, not at all once the overview has opened.
function currentReach(background) {
    const { workarea, left, top, right, bottom } = reservedSpace(background._monitorIndex);
    const share = 1 - Math.min(1, Math.max(0, background._stateAdjustment.value));
    return { workarea, left: left * share, top: top * share, right: right * share, bottom: bottom * share };
}

// The wallpaper is laid out past the workspace's own box, and this box is what
// cuts it off: GNOME's rounded clip only rounds the corners, it does not stop
// the wallpaper beyond them. So keep the box clip, opened as far as the reach.
function syncBoxClip(background) {
    const box = background._bin;
    const { workarea, left, top, right, bottom } = currentReach(background);
    if (left + top + right + bottom === 0) {
        box.remove_clip();
        box.clip_to_allocation = true;
        return;
    }

    const { width, height } = box;
    const scaleX = width / workarea.width;
    const scaleY = height / workarea.height;
    box.clip_to_allocation = false;
    box.set_clip(-left * scaleX, -top * scaleY,
        width + (left + right) * scaleX, height + (top + bottom) * scaleY);
}

// The work area a workspace background keeps is only read to place its clip,
// here and by extensions that clip a layer of their own over the wallpaper
// (a live wallpaper, for one). Stretching it moves every such clip together,
// where moving only GNOME's would leave the other layer ending at the dock.
function updateRoundedClipBounds(original) {
    return function () {
        if (!this._dhruvaBoxClipId)
            this._dhruvaBoxClipId = this._bin.connect('notify::allocation', () => syncBoxClip(this));

        const { workarea, left, top, right, bottom } = currentReach(this);
        this._workarea = {
            x: workarea.x - left,
            y: workarea.y - top,
            width: workarea.width + left + right,
            height: workarea.height + top + bottom,
        };

        original.call(this);
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
// which stops a sliding workspace from showing on the next monitor. Open that
// clip only over the monitor's own reserved space.
function reachPastWorkArea(display) {
    const syncClip = () => {
        const { left, top, right, bottom } = reservedSpace(display._monitorIndex);
        const reaches = left + top + right + bottom > 0;
        display.clip_to_allocation = !reaches;
        if (reaches) display.set_clip(-left, -top, display.width + left + right, display.height + top + bottom);
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
