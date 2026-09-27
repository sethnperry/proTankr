// lib/content/learnTopics.tsx
// Single source of truth for the detailed "how it works" content shared by
// two very different consumers:
//   - app/learn/page.tsx    -- in-app, dark theme, accordion-per-topic
//   - app/about/page.tsx +
//     app/about/[slug]/page.tsx -- marketing site, light theme, one card
//                                   per topic linking to its own deep-dive
//                                   page
// Editing a topic's `blocks` here updates both places at once -- that's
// the whole point of pulling this out instead of leaving it inlined in
// app/learn/page.tsx like it originally was.
//
// The body content below is deliberately theme-agnostic: no hardcoded
// colors. Emphasis uses <Em>, which renders a bare <strong> and takes its
// color from whatever `.lt-em` rule the CONSUMING page defines (dark
// Learn page vs light About page need opposite colors for the same
// semantic emphasis) -- see each consumer's own CSS for the two
// definitions.

import type { ReactNode } from "react";

export function Em({ children }: { children: ReactNode }) {
  return <strong className="lt-em">{children}</strong>;
}

/** Bare bullet list, spacing-only (no color) so it's safe in either theme. */
export function List({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      {children}
    </ul>
  );
}

/**
 * Every plain emoji character used anywhere in LEARN_TOPICS, mapped to a
 * locally-hosted Twemoji SVG (public/icons/emoji/, pinned to twemoji
 * 14.0.2 -- graphics are Twitter/X's Twemoji, licensed CC-BY 4.0:
 * https://github.com/jdecked/twemoji, attribution required if this ever
 * gets a public credits/about page). Native emoji glyphs render completely
 * differently per platform (Apple's iOS set is glossy and colorful,
 * Windows' Segoe set is flatter and duller, Android's Noto set is
 * different again) -- confirmed by the user as the reason icons looked
 * "more graphic" on their phone than on desktop. Rendering one shared SVG
 * set as an <img> instead of literal emoji text makes every platform show
 * the exact same icon. Falls back to literal emoji text for anything not in
 * this table (shouldn't happen for content in this file, but keeps Icon
 * safe if a new emoji gets added here later without updating the map).
 */
const EMOJI_MAP: Record<string, string> = {
  "🔄": "/icons/emoji/1f504.svg",
  "🔗": "/icons/emoji/1f517.svg",
  "🛢": "/icons/emoji/1f6e2.svg",
  "⚡": "/icons/emoji/26a1.svg",
  "🌡": "/icons/emoji/1f321.svg",
  "🌤": "/icons/emoji/1f324.svg",
  "☀️": "/icons/emoji/2600.svg",
  "🌬": "/icons/emoji/1f32c.svg",
  "🧠": "/icons/emoji/1f9e0.svg",
  "🎯": "/icons/emoji/1f3af.svg",
  "⚠️": "/icons/emoji/26a0.svg",
  "⚠": "/icons/emoji/26a0.svg",
  "⚖️": "/icons/emoji/2696.svg",
  "⚖": "/icons/emoji/2696.svg",
  "🧮": "/icons/emoji/1f9ee.svg",
  "📊": "/icons/emoji/1f4ca.svg",
  "📡": "/icons/emoji/1f4e1.svg",
  "🌐": "/icons/emoji/1f310.svg",
  "⚙️": "/icons/emoji/2699.svg",
  "⚙": "/icons/emoji/2699.svg",
  "📉": "/icons/emoji/1f4c9.svg",
  "🪣": "/icons/emoji/1faa3.svg",
};

/**
 * Renders a topic/block `icon` value: a plain emoji character is resolved
 * through EMOJI_MAP to a locally-hosted SVG (falling back to literal emoji
 * text if unmapped), a "/..." value is treated as an image path (public/)
 * and rendered as an <img> directly -- lets equipment-setup use the real
 * truck renders while every other topic keeps its emoji, from the same
 * field. A "badge:X" value renders a small black rounded-rect badge with
 * letter X (Outfit, matching the app font) over a dot -- the same look
 * PresetDial.tsx gives an active preset slot -- so the plan-slots topic can
 * use a real plan slot instead of a generic clipboard icon.
 */
export function Icon({ value, size = 18 }: { value: string; size?: number }) {
  if (value.startsWith("badge:")) {
    const letter = value.slice(6);
    return (
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: size * 0.82,
          height: size * 1.1,
          borderRadius: size * 0.26,
          background: "#000",
          gap: size * 0.09,
          flexShrink: 0,
          verticalAlign: "middle",
        }}
      >
        <span style={{ fontFamily: "var(--font-outfit), Outfit, sans-serif", fontWeight: 600, fontSize: size * 0.48, lineHeight: 1, color: "#fff" }}>
          {letter}
        </span>
        <span style={{ width: size * 0.1, height: size * 0.1, borderRadius: "50%", background: "#fff" }} />
      </span>
    );
  }
  const src = value.startsWith("/") ? value : EMOJI_MAP[value];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny static
    // icon rendered at varying sizes across three very different layout
    // contexts; not a Next/Image candidate.
    return (
      <img
        src={src}
        alt=""
        style={{ height: size, width: "auto", display: "inline-block", verticalAlign: "middle" }}
      />
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1, verticalAlign: "middle" }}>{value}</span>;
}

export type LearnBlock =
  | { type: "section"; emoji: string; title: string; body: ReactNode }
  | { type: "divider"; label: string }
  | { type: "callout"; body: ReactNode };

export type LearnTopic = {
  slug: string;
  emoji: string;
  /** Accordion title in the in-app Learn page, and the deep-dive page's H1. */
  title: string;
  /** Short label for the About page's card grid. */
  shortName: string;
  /** One-line hook under the card title. */
  tagline: string;
  /** 1-2 paragraph "why this matters" pitch -- About card body + deep-dive intro. Not shown in-app. */
  marketing: ReactNode;
  /** The detailed, factual breakdown -- shared verbatim by both consumers. */
  blocks: LearnBlock[];
};

export const LEARN_TOPICS: LearnTopic[] = [
  // ── Equipment & compartment setup ───────────────────────────────────────
  {
    slug: "equipment-setup",
    emoji: "/icons/truck-front.png",
    title: "How to set up the planner",
    shortName: "Equipment Setup",
    tagline: "Set it once, load in seconds.",
    marketing: (
      <>
        <p>
          ProTankr also doubles as a place to store and share equipment
          details, a real digital transfer of knowledge (TOK) for your
          fleet. None of that is required to use the Planner, though;
          setup stays quick and simple.
        </p>
        <p>
          Name the equipment (Unit #), add your compartments and their max
          volumes, and set your safety cap. Couple trucks to trailers
          freely.
        </p>
        <p>
          Tare weight is the detail that matters most. Every coupled unit
          needs one. We recommend weighing the combined truck and trailer
          empty but with full saddle tanks, since it normalizes the math
          and builds in a burn buffer for the diesel used between the
          terminal and the scale.
        </p>
        <p>
          Everything is tied to the equipment, not the driver, so it
          survives trailer swaps and shift changes without a reweigh or a
          lost detail.
        </p>
        <p>
          After that, loading a truck is three taps: pick your terminal,
          tap a saved plan, hit Load. Everything else runs silently in
          the background.
        </p>
      </>
    ),
    blocks: [
      { type: "divider", label: "Step 1: Equipment  (set it and forget it)" },
      {
        type: "section",
        emoji: "/icons/truck-side.png",
        title: "Select your Equipment",
        body: (
          <List>
            <li>
              Tap the equipment area at the top of the planner and select
              your truck and trailer combination. This is the most
              important step, since everything in the plan flows from it.
            </li>
            <li>
              <Em>Tare weight</Em> is the empty weight of your truck and
              trailer combined. The plan subtracts this from your target
              gross weight to determine how many pounds of product you can
              legally carry.
            </li>
            <li>
              <Em>Target weight</Em> is your gross vehicle weight goal, set
              intentionally below the legal limit to give yourself a safety
              buffer for API drift and temperature variance. A good target
              leaves 400 to 600 lbs of room.
            </li>
          </List>
        ),
      },
      {
        type: "section",
        emoji: "🔄",
        title: "Slip seating",
        body: (
          <List>
            <li>
              If you are taking over a truck someone else drove, select
              their exact combination. The compartment configuration,
              tare, and target are all tied to the equipment, not the
              driver. Selecting the right unit means the math is already
              dialed in from the previous driver's setup.
            </li>
            <li>
              If being utilized the driver will see the next service due,
              wash record and other details about the shared equipment.
              Any permit or compliance document expiring soon will appear
              in the notification bell. Digital copies of documents can
              also be stored and shared easily.
            </li>
          </List>
        ),
      },
      {
        type: "section",
        emoji: "🔗",
        title: "Coupling loose units",
        body: (
          <>
            Individual tractors and trailers can be mixed and matched, each
            combination is tracked. The reason we track them as a pair
            rather than separately is that the compartment configurations
            are specific to the trailer, while axle weights and bridge laws
            depend on the tractor and trailer combination. This gives the
            plan everything it needs to compute a legal, accurate load.
          </>
        ),
      },
      { type: "divider", label: "Step 2: Compartment caps  (set it and forget it)" },
      {
        type: "section",
        emoji: "🛢",
        title: "Setting headspace caps",
        body: (
          <>
            <p>
              Each compartment has three volume caps. The max volume is the
              total physical space in the compartment, hard stop. The
              safety cap, or headspace is intended to keep the formula from
              calculating a volume too close to the max, keeping the
              product safely away from the trailer's overflow prevention
              system. The third cap is a handle on the plan compartment
              itself. It is a quick throw for the driver to dial in the
              planner within the preset boundary. The company would set the
              boundary and the driver operates within it.
            </p>
            <p>
              One strategy may be for the driver to set up the planner
              presets to fill each compartment to the same memorable volume
              they always have, but allow the rear compartment to change
              with conditions. Allowing for the same muscle memory they are
              used to with only one new number to think about before
              jumping out to load (the rear compartment). No need to write
              anything down. If the delivery location can only hold a
              limited amount of one product, simply dial in that
              compartment and let the others compensate with a quick swipe
              gesture.
            </p>
          </>
        ),
      },
      { type: "divider", label: "Step 3: Plan slots  (You drive the plan)" },
      {
        type: "section",
        emoji: "badge:E",
        title: "What are plan slots?",
        body: (
          <>
            <p>
              Plan slots are saved load configurations: which product goes
              in which compartment, at what quantity. Think of them as
              presets you build once and reuse every time you load that
              specific product. You could even save one layout for split
              loads. The planner makes split loads just as efficient as
              any.
            </p>
            <p>
              Most drivers work in divisions with a primary focus on
              loading the same type of products. Slots are saved
              configurations that allow the driver to repeat the same plan
              again and again. If a driver moonlights in a different
              division or gets an irregular load, simply change the
              planner without saving the plan.
            </p>
            <p>
              Build them once and they are there every time with a single
              tap. Make temporary changes on the fly. You decide how to use
              them for your specific situation.
            </p>
          </>
        ),
      },
      {
        type: "section",
        emoji: "⚡",
        title: "Once you are set up, it's this simple",
        body: (
          <>
            <p>
              No password. The profile is keyed to the device after the
              initial login. Just open the app. Select your location and
              terminal. The planner shows your saved slots. Tap the one
              that matches today's load. The plan is built instantly:
              compartments filled, weight calculated, CG balanced. Tap
              Load. Done.
            </p>
            <p>
              The whole process from opening the app to starting the load
              takes under a minute. Everything you set up runs silently in
              the background every time.
            </p>
          </>
        ),
      },
    ],
  },

  // ── Temperature prediction ──────────────────────────────────────────────
  {
    slug: "temperature-prediction",
    emoji: "🌡",
    title: "How the temperature prediction works",
    shortName: "Temperature Prediction",
    tagline: "Know your weight before the sun does.",
    marketing: (
      <>
        <p>
          Product temperature is one of the biggest hidden variables in a
          load, colder product is denser, so the same gallon count weighs
          more. Guess wrong and you're either leaving gallons on the table
          out of caution, or finding out you're overweight at the scale.
        </p>
        <p>
          ProTankr predicts product temperature from real weather data and
          the physics of a large storage tank, then keeps correcting itself
          against what actually happened at each terminal, while always
          leaving the final call to you.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "🌤",
        title: "30 hours of weather history",
        body: (
          <>
            We pull hourly temperature, wind speed, and cloud cover from
            OpenWeather for the past 24 to 30 hours at this terminal's
            location. This gives the model a full picture of how the
            environment has been heating or cooling the storage tank.
          </>
        ),
      },
      {
        type: "section",
        emoji: "☀️",
        title: "Solar gain calculation",
        body: (
          <>
            Using the terminal's exact latitude and longitude, we calculate
            the sun's elevation angle for every hour of the past day.
            Higher sun angle + clear skies = more radiant heat absorbed by
            the tank surface. Overcast or nighttime hours contribute zero
            solar gain.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌬",
        title: "Wind cooling adjustment",
        body: (
          <>
            Wind accelerates how quickly product temperature chases the
            ambient air. Higher wind speeds increase the effective cooling
            rate, pulling the prediction closer to ambient on breezy days
            and reducing the impact of solar heating.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🛢",
        title: "Large tank model, intentionally conservative",
        body: (
          <>
            We model a large above-ground storage tank (~1 million
            gallons). Large tanks have enormous thermal mass, they heat
            and cool very slowly, lagging well behind ambient swings. This
            is <Em>intentional</Em>: we'd rather predict the product is
            colder and denser than it turns out to be, which keeps you
            safely under your weight limit.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌡",
        title: "Live ambient blending",
        body: (
          <>
            The current ambient temp is gently blended into the final
            result to account for the last few minutes of temperature
            change. This keeps the prediction current without overreacting
            to short-term spikes.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🧠",
        title: "Self-training bias correction",
        body: (
          <>
            Every time you complete a load and enter the actual observed
            product temperature, ProTankr computes the difference between
            what it predicted and what you actually saw. This error is
            stored per terminal, per hour of day, and per month of year.
            <br />
            <br />
            Over time, the model learns terminal-specific patterns, for
            example, that a particular terminal's tanks run 5 to 9°F
            colder than predicted at 3am in March, or warmer on sunny
            afternoons.
            The correction is applied automatically on the next prediction
            at that terminal.
            <br />
            <br />
            The correction is weighted by confidence, it takes at least 3
            observations before any correction is applied, and grows to
            full weight around 10+ observations. This prevents a single
            outlier from throwing off the model.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🎯",
        title: "Confidence levels",
        body: (
          <>
            <Em>High</Em>: Clear skies and calm winds over the past 24h.
            Solar gain was predictable and the model is well-constrained.
            <br />
            <br />
            <Em>Medium</Em>: Partly cloudy. Cloud variability introduces
            some uncertainty in how much solar heat the tank absorbed.
            <br />
            <br />
            <Em>Low</Em>: Heavy cloud cover or high winds. Use the number
            as a starting point but lean on what you know about this
            terminal.
          </>
        ),
      },
      {
        type: "callout",
        body: (
          <>
            <strong><Icon value="⚠️" size={14} /> Use your judgement.</strong> Override the prediction
            freely, you know your terminal better than any model. It is
            strongly recommended <strong>not to set the planned product
            temp above ambient</strong> unless you have full confidence from
            a recent BOL. When in doubt, err cold. A colder planned temp
            predicts denser product, which protects you from overweight
            loads.
          </>
        ),
      },
    ],
  },

  // ── Weight plan ──────────────────────────────────────────────────────────
  {
    slug: "weight-plan",
    emoji: "⚖️",
    title: "How the weight plan works",
    shortName: "Weight Plan",
    tagline: "Real physics, not guesswork.",
    marketing: (
      <>
        <p>
          The only defense against an overweight ticket has been to either
          load on an axle scale or load conservatively, because doing the
          real density and thermal-expansion math by hand, for every load,
          at every terminal, isn't realistic on a schedule measured in
          minutes.
        </p>
        <p>
          ProTankr runs the actual ASTM D1250 calculation automatically,
          the same standard terminals and weight enforcement use, so you
          can load to your real legal capacity instead of a safety margin
          built on guesswork.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "🧮",
        title: "API gravity and density",
        body: (
          <>
            API gravity is the industry standard for measuring how light or
            heavy a petroleum product is. A lower API number means heavier
            product, more pounds per gallon. The plan uses the most
            recently observed API at this terminal (entered by the last
            driver) to calculate how many pounds each gallon will weigh at
            the planned temperature.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌡",
        title: "Temperature correction",
        body: (
          <>
            Petroleum expands when warm and contracts when cold. The same
            number of gallons weigh more at 40°F than at 90°F. The plan
            corrects for this using the ASTM D1250 thermal expansion
            formula, the same standard used by terminals and weight
            enforcement.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🎯",
        title: "Target weight",
        body: (
          <>
            The target weight is your gross vehicle weight goal, tare
            weight plus payload, set below the legal limit for a small
            buffer. The plan fills compartments to hit this target, not to
            maximize gallons.
          </>
        ),
      },
      {
        type: "section",
        emoji: "⚖️",
        title: "CG slider",
        body: (
          <>
            The center of gravity slider shifts weight distribution between
            the front and rear of the trailer. Moving it moves gallons
            between the compartments. Moving it forward puts more weight on
            the drive axles, moving it rearward shifts weight toward the
            trailer axles. Use it to optimize axle weight distribution for
            your specific terrain and conditions, or simply to shift things
            for a slightly faster drop when delivering.
          </>
        ),
      },
    ],
  },

  // ── Self-correcting network ─────────────────────────────────────────────
  {
    slug: "self-correcting-network",
    emoji: "📊",
    title: "How the self-correcting network works",
    shortName: "Self-Correcting Network",
    tagline: "Every load makes the next one smarter.",
    marketing: (
      <>
        <p>
          Every driver is fighting the same invisible enemy: a new
          shipment or a tank change with a different product weight and/or
          density reading. Everyone pays for that uncertainty at the scale
          without any means to communicate the change with each other. As
          a consequence, many drivers get many overweight tickets before
          ultimately resolving to load light, all the time, just to cover
          the worst case.
        </p>
        <p>
          ProTankr turns that around. The first driver to observe a shift
          corrects it for every driver who loads there next, across every
          company, in real time, instead of everyone independently
          re-discovering the same surprise.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "📡",
        title: "What actually gets shared",
        body: (
          <>
            Just the observed API gravity, tied to a specific product at a
            specific terminal, plus the time it was recorded. Nothing about
            your route, your company, or your identity travels with it.
            It's a density reading, not a tracking system.
          </>
        ),
      },
      {
        type: "section",
        emoji: "⚡",
        title: "How fast it propagates",
        body: (
          <>
            The moment you enter the actual API from the BOL at the loading
            rack, the correction is live. The very next driver who plans a
            load for that same product at that same terminal sees your
            fresh number, not one from four days ago. There's no batch job
            or delay, the update happens the instant you submit it.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🌐",
        title: "Shared industry-wide, not just your fleet",
        body: (
          <>
            The network isn't scoped to your company. A driver from a
            completely different fleet, loading the same product at the
            same terminal, benefits from your observation, and you benefit
            from theirs. The more drivers loading there, the fresher the
            reading stays for everyone, regardless of who they drive for.
          </>
        ),
      },
      {
        type: "callout",
        body: (
          <>
            <strong><Icon value="⚙️" size={14} /> Runs quietly in the background.</strong> There's no
            alert, no notification, no extra step. You just open the app
            next time you load at that terminal, and the number waiting
            for you is already current.
          </>
        ),
      },
    ],
  },

  // ── Over/under ───────────────────────────────────────────────────────────
  {
    slug: "over-under",
    emoji: "📉",
    title: "Understanding over/under",
    shortName: "Over/Under",
    tagline: "What causes it, and how to fix it fast.",
    marketing: (
      <>
        <p>
          Even with real time corrections from the self-correcting network,
          an occasional overweight reading still happens. API drift and
          temperature are the two real causes, and both are explainable,
          not random.
        </p>
        <p>
          Here's why each one happens, and exactly what to do if your load
          report shows you over the legal limit.
        </p>
      </>
    ),
    blocks: [
      {
        type: "section",
        emoji: "📉",
        title: "Why you might go over",
        body: (
          <>
            <Em>API drift</Em> is the most common cause, and the hardest to
            predict. When a terminal receives a new shipment, the product
            gravity will shift. The change is usually minor and equates to
            less than a couple hundred pounds in a full load. Setting the
            target slightly lower than legal will accommodate these minor
            swings.
            <br />
            <br />
            However, there have been black swan events in which a
            dramatically heavier product is received, likely a different
            grade from an atypical refinery. This is an outlier, but
            traditionally every driver would need to load significantly
            less than they otherwise could, all the time, just to
            accommodate the worst case scenario. ProTankr attempts to
            remedy this. The first driver to observe the drift records it,
            correcting the density calculation for everyone thereafter. The
            "as of" date shown next to the planned API in your load report
            tells you how stale the API reading is. A reading from four
            days ago is a warning sign. In this case, simply load light or
            update the API from a more current BOL before loading.
            <br />
            <br />
            <Em>The silver lining:</Em> the moment you enter the actual API
            from the BOL at the loading rack, two things happen. You will
            know immediately, before crossing any scale, if the load is
            overweight, and will have a chance to correct it before it
            becomes a ticket. The app is updated for that
            specific product at that terminal for every driver who loads
            there next. The next driver plans with your fresh observation,
            and the community self-corrects in real time.
            <br />
            <br />
            <Em>Temperature</Em> is the second cause. If the product is
            cooler than planned it is denser, meaning more product is
            condensed into the same gross gallon. The pump only recognizes
            volume, so more product ends up on board. The temperature
            prediction model attempts to remedy this variable. The model
            has a self-training feature that over time will dial the
            prediction closer and closer to reality with every load. Still,
            there are unknown variables that cannot be fully accounted for
            in any model.
          </>
        ),
      },
      {
        type: "section",
        emoji: "🪣",
        title: "Drain-down calculation",
        body: (
          <>
            If the load report shows you are over the legal 80,000 lb gross
            limit, it will calculate exactly how many gallons to drain from
            the rear compartment to bring you legal. This uses the actual
            observed density from that compartment's loaded weight and
            gallons.
            <br />
            <br />
            Be sure to follow company policy to account for where and how
            to drain-down, if ever necessary. This is only meant to
            quickly determine the exact gallons required to get legal
            again. Keep in mind the burn buffer from the saddle tank(s)
            could make any drain-down unnecessary. If the tare weight
            entered included a full saddle, you will have burned roughly
            25 gallons by the time you reach the scale, so if the
            calculated drain-down is less than 25 gallons, you're in good
            shape.
          </>
        ),
      },
    ],
  },
];

export function getLearnTopic(slug: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((t) => t.slug === slug);
}
