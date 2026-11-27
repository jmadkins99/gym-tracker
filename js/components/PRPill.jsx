        // The PR flame: gold outer flame with a darker inner flame, drawn as an
        // inline SVG so it is not an emoji. Sized to the surrounding text (1.2em, since the flame fills about 70% of its box).
        // Each instance carries its own gradient with a unique id, so many pills
        // on one page never share, or lose, a `url(#id)` target when one unmounts.
        let flameCount = 0;
        function FlameIcon() {
            const [gradientId] = React.useState(() => 'pr-flame-gold-' + (++flameCount));
            return (
                <svg className="pr-flame" viewBox="0 0 24 24" width="1.2em" height="1.2em"
                     aria-hidden="true" focusable="false">
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                            <stop offset="0" stopColor="#d4a437" />
                            <stop offset="1" stopColor="#ffe08a" />
                        </linearGradient>
                    </defs>
                    <path fill={'url(#' + gradientId + ')'}
                          d="M13.1 3c.3 2.2 2.1 3.6 3.4 5.4 1.7 2 2.9 4.1 2.9 6.7 0 4-3.3 7.1-7.4 7.1s-7.4-3.1-7.4-7c0-2.6 1.2-4.6 2.8-6.2.2 1.7 1.1 2.9 2.4 3.4-.5-3.4.8-6.9 3-9.8Q12.4 1.2 13.1 3z" />
                    <path fill="#07080f" opacity=".55"
                          d="M12.3 11.6c.3 1.7 1.5 2.6 2.4 3.7.6.8.9 1.6.9 2.5 0 2-1.6 3.6-3.6 3.6s-3.6-1.6-3.6-3.5c0-1.2.5-2.2 1.3-3 .2.9.8 1.5 1.5 1.7-.3-1.6.2-3.3 1.1-5z" />
                </svg>
            );
        }

        // The pill for a PR: the flame, then "PR" for a lone PR or "×N" once the
        // run is N >= 2 sessions long. Every pill (card, History, Day Breakdown)
        // is this one component; `as` picks the element, the rest passes through.
        function PRPill({ streak, as: Tag = 'div', ...rest }) {
            return (
                <Tag role="img" aria-label={formatPRPillLabel(streak)} {...rest}>
                    <FlameIcon />
                    {formatPRPill(streak)}
                </Tag>
            );
        }
