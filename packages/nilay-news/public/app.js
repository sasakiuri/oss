// SPDX-License-Identifier: MIT
import { bindControls } from "./ui/controls.js";
import { refresh } from "./ui/inbox.js";
import { connectViews, render } from "./ui/render.js";

connectViews();
bindControls();
render();
refresh();
