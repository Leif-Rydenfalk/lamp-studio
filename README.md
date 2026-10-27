# One lamp, one cell — `render.scene/1` snapshot

The cell renderer drawing one real Berlin street lamp: asset `43378-2110031-00` on Unter den Linden,
from Berlin's GDI WFS `beleuchtung` (feature `beleuchtung.153492`, dl-de/by-2-0).

This page is a **snapshot** of the `street.lamp@1` cell rendered by `render-web` (the cell-based renderer),
not the old Twinton sandbox. The live chain is:

```
street.lamp@1  ->  lamp-gateway  ->  render.scene/1  ->  render-web
```

The source of the cell and the gateway is in the ce-net workspace: `street-lamp/`, `lamp-gateway/`,
`render-web/`. Run the live chain with `make lamp-demo` (http://127.0.0.1:8090/).

No street, no chart, no buildings: one lamp, its base, mast, bracket arm and luminaire, in a studio.
The mast, arm and luminaire are modelled, not a survey.
