        // The swipe rail both decks ride on: the Workout deck (one exercise per
        // card) and History (one date per card). It owns the horizontal
        // gesture, the three-slot rail and the slide animation; each deck owns
        // what its cards are and what a vertical drag means.
        //
        // Gestures are hand-written pointer events. There is no gesture library
        // here and no build step to add one, and pointer events cover mouse and
        // touch in a single path — which is also what makes this checkable in
        // desktop Firefox before it goes near a gym.

        // How far a drag has to travel to count. Horizontal scales with the card
        // so it feels the same on a phone and a laptop; vertical is a flat pixel
        // distance because card height varies far more than a thumb flick does.
        // A gesture commits on EITHER distance or speed. Distance alone forces
        // a bad trade: set it long and quick flicks get ignored, set it short
        // and a card you grabbed to read slides away under your thumb. Speed is
        // what separates the two intents, so a fast flick goes through however
        // short it is, while a slow deliberate drag still has to cross the line.
        const SWIPE_H_FRACTION = 0.18;
        const SWIPE_V_PIXELS = 58;
        // px per ms. About the speed of a flick that is unmistakably a flick.
        const FLICK_SPEED = 0.45;
        // A flick still has to travel far enough to not be a tap with a wobble.
        const FLICK_MIN_PIXELS = 22;
        // Below this, a drag has no direction yet and we refuse to guess — it is
        // what stops a sloppy diagonal doing two things at once.
        const AXIS_LOCK_PIXELS = 10;
        // Gap between neighbouring cards on the rail. Must match --deck-gap.
        const DECK_GAP = 14;
        // Must match the .deck-rail transition. A card you have left is closed
        // only after the rail has carried it off-stage — closing it any sooner
        // snaps it from open to nameplate while it is still in full view.
        const RAIL_MS = 300;

        // index/setIndex: the current card, owned by the caller.
        // last: the highest index; the rail never moves below 0 or above it.
        // onMove(target): called at the start of every move, before the index
        //   commits, including a move onto the card you are already on.
        // vertical: optional. Without it a vertical drag is ignored here and
        //   left to the page. With it, { damp(dy) → px to paint on the active
        //   card, onRelease(gesture) } where gesture carries dx, dy, vx, vy.
        function useSwipeRail({ index, setIndex, last, onMove, vertical }) {
            // Whether a finger is down. The drag ITSELF is deliberately not
            // React state: setDrag on every pointermove re-rendered the deck
            // and all three mounted cards dozens of times a second purely to
            // move a transform, which is what made the swipe feel coarse. The
            // live transform is written straight to the node instead, so a
            // gesture costs two renders — down and up — rather than one per
            // event.
            const [dragging, setDragging] = React.useState(false);
            // How far the rail is displaced from its resting position, in px.
            // A move sets this to where the rail *was* and then animates it to
            // zero, which is the trick that keeps the deck responsive: the
            // index commits immediately, so a second swipe never has to wait
            // for an animation to finish and can never be dropped.
            const [offset, setOffset] = React.useState(0);
            const [animating, setAnimating] = React.useState(false);
            const offsetRef = React.useRef(0);
            offsetRef.current = offset;
            const gesture = React.useRef(null);
            const stageRef = React.useRef(null);
            const railRef = React.useRef(null);
            const activeSlotRef = React.useRef(null);
            const raf = React.useRef(null);
            const paintFrame = React.useRef(null);

            React.useEffect(() => () => {
                cancelAnimationFrame(raf.current);
                cancelAnimationFrame(paintFrame.current);
            }, []);

            const clamp = (i) => Math.max(0, Math.min(last, i));

            // Snap the rail home with no animation, for a deck whose roster
            // was swapped underneath it.
            const reset = () => setOffset(0);

            // `dir` is the direction the rail should APPEAR to travel, which
            // is not always the distance travelled: a jump can cross most of
            // the deck, and sliding eleven cards' worth would read as a glitch.
            // One card of movement in the right direction is the honest signal
            // — where you landed is what the counter is for.
            const goTo = (target, dir) => {
                if (onMove) onMove(target);
                if (target === index) { setOffset(0); return; }

                const step = (stageRef.current ? stageRef.current.offsetWidth : 0) + DECK_GAP;
                // Commit first, then put the rail back where the eye last saw
                // it and let it travel home.
                setIndex(target);
                setAnimating(false);
                setOffset(dir * step);
                // Two frames: one for the browser to paint the displaced rail,
                // one to start the transition from it. Skipping this makes the
                // offset and the transition land together and nothing moves.
                cancelAnimationFrame(raf.current);
                raf.current = requestAnimationFrame(() => {
                    raf.current = requestAnimationFrame(() => {
                        setAnimating(true);
                        setOffset(0);
                    });
                });
            };

            // Moves by `delta` cards, stopping at either end. The rail always
            // appears to travel one card, whatever the distance.
            const go = (delta) => goTo(clamp(index + delta), delta < 0 ? -1 : 1);

            // ---- Gestures ----------------------------------------------------
            //
            // Nothing here calls setState while a finger is moving. The live
            // transform is written to the node inside a single rAF, so however
            // fast pointermove fires we paint at most once per frame and never
            // re-render React mid-gesture.
            const paint = () => {
                paintFrame.current = null;
                const g = gesture.current;
                if (!g || !g.axis) return;
                if (g.axis === 'x') {
                    const el = railRef.current;
                    if (!el) return;
                    el.style.transition = 'none';
                    el.style.transform = 'translateX(' + g.dx + 'px)';
                } else if (vertical) {
                    const el = activeSlotRef.current;
                    if (!el) return;
                    el.style.transition = 'none';
                    el.style.transform = 'translateY(' + vertical.damp(g.dy) + 'px)';
                }
            };

            const onPointerDown = (e) => {
                const control = e.target.closest('input, select, button, a');
                const now = e.timeStamp || performance.now();
                gesture.current = {
                    x: e.clientX, y: e.clientY, axis: null, dx: 0, dy: 0,
                    width: e.currentTarget.offsetWidth || 320,
                    // The control this gesture began on, if any. A gesture that
                    // starts on the weight box is not yet a swipe and not yet a
                    // tap — only movement decides, so we track it and wait.
                    control,
                    captured: false,
                    hijacked: false,
                    lastX: e.clientX, lastY: e.clientY, lastT: now,
                    vx: 0, vy: 0,
                };
                // Capture immediately ONLY when the gesture started on bare
                // card. Capturing over a field steals the tap from it, and the
                // reps dropdown stops opening — which is the bug the old
                // blanket bail-out was avoiding, at the cost of making those
                // fields dead zones for swiping.
                if (!control) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    gesture.current.captured = true;
                }
                setDragging(true);
            };

            const onPointerMove = (e) => {
                const g = gesture.current;
                if (!g) return;
                g.dx = e.clientX - g.x;
                g.dy = e.clientY - g.y;
                if (!g.axis && Math.hypot(g.dx, g.dy) > AXIS_LOCK_PIXELS) {
                    g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
                    // Movement has settled the question: this is a drag, not a
                    // tap. Take the pointer off the field now, and remember to
                    // swallow the tap it would otherwise fire on release. A
                    // vertical drag on a deck with no vertical gesture belongs
                    // to the page, so the field keeps it.
                    if (g.control && !g.captured && (g.axis === 'x' || vertical)) {
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
                        g.captured = true;
                        g.hijacked = true;
                        // Blur so a keyboard cannot come up mid-swipe.
                        if (document.activeElement === g.control) g.control.blur();
                    }
                }
                const now = e.timeStamp || performance.now();
                const dt = now - g.lastT;
                if (dt > 0) {
                    g.vx = (e.clientX - g.lastX) / dt;
                    g.vy = (e.clientY - g.lastY) / dt;
                    g.lastX = e.clientX; g.lastY = e.clientY; g.lastT = now;
                }
                if (paintFrame.current === null) {
                    paintFrame.current = requestAnimationFrame(paint);
                }
            };

            const onPointerUp = () => {
                const g = gesture.current;
                gesture.current = null;
                cancelAnimationFrame(paintFrame.current);
                paintFrame.current = null;
                if (!g) return;

                // A drag that began on a field would still fire a click on
                // release — focusing the input, or opening the reps picker,
                // right as the card slides away. Swallow exactly one, and clear
                // the trap shortly after in case no click ever comes.
                if (g.hijacked) {
                    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    document.addEventListener('click', swallow, { capture: true, once: true });
                    setTimeout(() => document.removeEventListener('click', swallow, true), 400);
                }

                // Put the nodes back to exactly the values React believes it
                // rendered, and let the CSS transition carry them there.
                //
                // Restoring these explicitly is not optional. React diffs
                // against its own previous props, so after `paint` has written
                // a transform behind its back the next render sees an unchanged
                // style prop and leaves the node alone — the dragged transform
                // then sticks forever. That is a stuck card, not a slow one,
                // and it looked like the reveal had broken.
                if (railRef.current) {
                    railRef.current.style.transition = '';
                    railRef.current.style.transform = 'translateX(' + offsetRef.current + 'px)';
                }
                if (activeSlotRef.current) {
                    activeSlotRef.current.style.transition = '';
                    activeSlotRef.current.style.transform = 'translateY(0px)';
                }
                setDragging(false);

                const flickedX = Math.abs(g.vx) > FLICK_SPEED && Math.abs(g.dx) > FLICK_MIN_PIXELS;
                if (g.axis === 'x' && (Math.abs(g.dx) > g.width * SWIPE_H_FRACTION || flickedX)) {
                    go(g.dx < 0 ? 1 : -1);
                    return;
                }
                if (g.axis === 'y' && vertical) vertical.onRelease(g);
            };

            // The rail carries previous, current and next together, so a drag
            // shows the neighbours sliding in rather than black nothing. While
            // a finger is down this is only the STARTING value — `paint` above
            // owns the node until the finger lifts.
            const railStyle = {
                transform: 'translateX(' + offset + 'px)',
                transition: (animating && !dragging) ? undefined : 'none',
            };

            // Positions one of the three slots: -1, 0 or 1 relative to the
            // current card.
            const slotProps = (slotOffset) => ({
                className: 'deck-slot',
                ref: slotOffset === 0 ? activeSlotRef : null,
                style: {
                    left: 'calc((100% + var(--deck-gap)) * ' + slotOffset + ')',
                    // Vertical drags move only the active card, and while one
                    // is in progress `paint` owns this node.
                    transform: 'translateY(0px)',
                    transition: dragging ? 'none' : undefined,
                },
                'aria-hidden': slotOffset !== 0,
            });

            const stageProps = {
                ref: stageRef,
                onPointerDown,
                onPointerMove,
                onPointerUp,
                onPointerCancel: onPointerUp,
            };

            return { goTo, go, reset, stageProps, railRef, railStyle, slotProps };
        }
