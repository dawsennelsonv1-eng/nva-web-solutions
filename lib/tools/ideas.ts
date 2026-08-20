/**
 * lib/tools/ideas.ts — THE CANDIDATE TOOL CATALOGUE.
 *
 * ============================================================================
 * READ THIS FIRST IF YOU ARE LOOKING FOR "WHAT TOOLS ARE WE BUILDING NEXT"
 * ============================================================================
 *
 * THIS FILE IS THE ANSWER. It is the single canonical list of tools NVA has
 * considered building, one entry per idea, each with an honest assessment of
 * whether it is worth building on this stack.
 *
 * It exists because that list previously lived nowhere. `lib/tools/catalogue.ts`
 * holds the two tools that are BUILT (epoxy, painting) and says nothing about
 * intent; `lib/verticals/` holds the two modules that exist. An assistant asked
 * "which tool should we build next" had no file to read and could only invent
 * an answer, which is worse than having none.
 *
 * ============================================================================
 * WHAT THIS FILE IS NOT
 * ============================================================================
 *
 * NOT A ROADMAP. Nothing here is scheduled, promised or costed. `verdict` is a
 * recommendation and several entries recommend against building at all.
 *
 * NOT IMPORTED BY ANYTHING AT RUNTIME. It compiles, it is typed, and it is
 * deliberately inert: no page renders it and no route reads it. It is
 * documentation that the compiler keeps honest — a malformed entry is a build
 * error rather than a stale paragraph in a markdown file nobody opened.
 *
 * NOT THE BUILD PROCEDURE. That is docs/NEW_VERTICAL.md: one module file, one
 * defaults migration, two lines in lib/verticals/manifest.ts.
 *
 * ============================================================================
 * THE ONE THING THAT DECIDES WHETHER A TOOL WORKS
 * ============================================================================
 *
 * Epoxy works on camera because A FLOOR IS A LARGE FLAT PLANE. That makes the
 * render both easy for an image model to get right and dramatic for a viewer to
 * look at. Every judgement in this file comes back to that:
 *
 *   LARGE FLAT SURFACE, PHOTOGRAPHABLE FROM WHERE A PERSON STANDS
 *     -> a visualiser will work, and will be shared.
 *     Floors, exterior walls, lawns, roofs from the street, driveways, decks.
 *
 *   SMALL, CLUTTERED OR ENCLOSED
 *     -> renders come back subtly wrong in ways a tradesperson spots instantly,
 *     and one distrusted render costs more credibility than ten good ones earn.
 *     Bathrooms, panel interiors, pipework.
 *
 *   NOT VISUAL AT ALL
 *     -> a visualiser is the wrong product. Some of the strongest ideas below
 *     are quoting or diagnostic tools with NO image generation, and they are
 *     cheaper to run and easier to make accurate. Do not force a render onto a
 *     trade that does not have a before-and-after.
 *
 * ============================================================================
 * COST, BECAUSE IT IS THE CONSTRAINT THAT BIT FIRST
 * ============================================================================
 *
 * Image generation is the most expensive call in this product by an order of
 * magnitude. Phase 67 capped renders at one per visitor after a five-photo
 * visitor was found to be triggering five paid generations. `costShape` on each
 * entry states what a single lead costs to serve, because a tool that produces
 * cheap leads at high volume beats a tool that produces beautiful ones nobody
 * can afford to show.
 *
 * The unbuilt lever that matters most: render results are not cached. The same
 * photo with the same selections is regenerated every time, which is why
 * recording an advert burns credit so fast. Keying a render on a hash of photo
 * plus selections would make every repeat free.
 */

/** Who actually uses the tool. It changes everything about the funnel. */
export type ToolAudience =
  /** A homeowner, on the contractor's site. Generates leads. Shareable. */
  | 'homeowner'
  /** The contractor or their crew. Sold as software; no viral surface. */
  | 'contractor';

/** How plausible this is on the stack as it stands today. */
export type ToolFeasibility =
  /** Buildable now by copying the epoxy or painting module. */
  | 'ready'
  /** Buildable, but needs one capability that does not exist yet. */
  | 'needs-new-capability'
  /** Needs hardware, a licence, or specialist data. Not a weekend. */
  | 'heavy';

export type ToolRating = 'high' | 'medium' | 'low' | 'none';

export interface ToolIdea {
  /** Stable slug. Would become the vertical id if built. */
  id: string;
  /** The trade, as a contractor would name their own business. */
  trade: string;
  name: string;
  /** What it does, in the plainest sentence available. */
  summary: string;
  audience: ToolAudience;
  /** What the user has to supply. The shorter this is, the better it converts. */
  inputs: string;
  /** What the backend has to do. Names real capabilities where they exist. */
  pipeline: string;
  /** Does it generate images? The single biggest cost driver. */
  needsImageGeneration: boolean;
  /** Shareability of the output. Drives organic reach. */
  viral: ToolRating;
  /** Typical job value for the contractor. Drives what a lead is worth. */
  ticket: string;
  feasibility: ToolFeasibility;
  /** What one lead costs to serve, and why. */
  costShape: string;
  /** Whether this came from the trade research list or was added here. */
  origin: 'research-list' | 'added';
  /**
   * The vertical id this was BUILT as, if it has been. PHASE 77.
   *
   * OPTIONAL BY DESIGN — most entries will never have it, and making it
   * required would mean touching thirty entries to record something true of
   * three. Its absence means "not built", which is the common case and needs no
   * ceremony.
   *
   * IT EXISTS BECAUSE THIS FILE WAS ALREADY WRONG. Phases 71 and 76 built
   * landscaping and cabinets, and until this field the catalogue still
   * described both as things to consider building. A canonical list that has
   * gone stale is worse than no list: it is confidently misleading, and the
   * next session to read it would have rebuilt what already exists.
   *
   * When a tool is built, set this AND say so in `verdict`. Both, because a
   * reader skimming verdicts should not have to check a second field to learn
   * the thing already ships.
   */
  builtAs?: string;
  /** The honest recommendation, including the ones that say don't. */
  verdict: string;
}

/**
 * ============================================================================
 * THE CATALOGUE
 * ============================================================================
 *
 * Ordered by trade, not by preference. See SHORTLIST at the bottom for the
 * recommendation.
 */
export const TOOL_IDEAS: readonly ToolIdea[] = [
  // -- Roofing --------------------------------------------------------------
  {
    id: 'roofing-satellite-quoter',
    trade: 'Roofing',
    name: 'Satellite address quoter',
    summary:
      'Homeowner types their address. Google Earth/Maps data gives roof square footage and pitch, producing a good/better/best estimate behind an email gate.',
    audience: 'homeowner',
    inputs: 'An address. Nothing else.',
    pipeline:
      'Maps/Earth API for footprint and pitch, then the existing quote kit. No vision call, no render.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: '$8,000-$25,000',
    feasibility: 'needs-new-capability',
    costShape:
      'Fractions of a cent per lead — a maps API call and arithmetic. By far the cheapest tool in this file to serve.',
    origin: 'research-list',
    verdict:
      'Strong. Typing an address is the lowest-friction input possible and the ticket is among the highest here. Not viral in the share-it sense, but the conversion rate should be excellent and the running cost is nearly zero. The new capability is satellite measurement, which is a real piece of work and reusable by fencing, gutters and solar.',
  },
  {
    id: 'roofing-storm-tracker',
    trade: 'Roofing',
    name: 'Automated storm-tracking campaign trigger',
    summary:
      'Monitors hail and storm data by zip code and fires targeted inspection offers into affected areas automatically.',
    audience: 'contractor',
    inputs: 'Service area zip codes, configured once.',
    pipeline: 'Weather API polling, a scheduler, and an email/ads integration.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software, not a job.',
    feasibility: 'needs-new-capability',
    costShape: 'Negligible per contractor. It is a cron job and an API key.',
    origin: 'research-list',
    verdict:
      'Genuinely valuable to a roofer and completely wrong for this product right now. It has no lead-generating surface, nothing to demonstrate on camera, and it is a background service rather than a tool on a website. Park it.',
  },

  // -- Landscaping & hardscaping --------------------------------------------
  {
    id: 'landscaping-visualiser',
    trade: 'Landscaping & hardscaping',
    name: 'Generative yard visualiser',
    summary:
      'Homeowner uploads a photo of their yard and describes what they want. The tool renders photorealistic mockups of the finished project.',
    audience: 'homeowner',
    inputs: 'One photo of the yard, plus a choice of style.',
    pipeline:
      'Almost exactly the epoxy pipeline: photo in, finish selection, render out. A lawn or patio is a large flat plane seen from standing height.',
    needsImageGeneration: true,
    viral: 'high',
    ticket: '$5,000-$40,000',
    feasibility: 'ready',
    costShape:
      'One render per lead under the phase 67 cap. Same order as epoxy.',
    origin: 'research-list',
    builtAs: 'landscaping',
    verdict:
      'BUILT — phase 71, as lib/verticals/landscaping, with a tool page in phase 75. Six styles, clearance priced as its own line, migration 0025. One of the three best on this list. A dead yard becoming a finished patio is the most legible transformation in home services, the surface geometry is as forgiving as a floor, and the ticket is high. Constrain it to a picker of defined styles rather than a free text prompt — free text produces renders no contractor can price, and pricing is the whole product. ARTIFICIAL TURF BELONGS HERE AS A STYLE, NOT AS ITS OWN TOOL: a dead brown lawn turning perfect green is among the most shareable transformations available, and it is the same photo, the same measurement and the same render as every other yard style. Building it as a separate vertical would duplicate an entire module for one material.',
  },
  {
    id: 'landscaping-bom',
    trade: 'Landscaping & hardscaping',
    name: 'Automated bill of materials from the mockup',
    summary:
      'Parses the generated mockup to estimate stone square footage and plant counts, routing a qualified lead to the CRM.',
    audience: 'contractor',
    inputs: 'A mockup already generated by the visualiser.',
    pipeline: 'A second vision call reading the generated image.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Attaches to the visualiser lead.',
    feasibility: 'needs-new-capability',
    costShape: 'A second vision call per lead — roughly doubles analysis cost.',
    origin: 'research-list',
    verdict:
      'Do not build this as specified. Measuring materials off an IMAGE THE MODEL INVENTED means quoting against a hallucination: the render is a picture of a plausible patio, not a plan, and its stone count is fiction with a number attached. Estimate from the measured yard and the chosen style instead. As a phase-two add-on to the visualiser, and only that way, it is fine.',
  },

  // -- Concrete, foundation & epoxy -----------------------------------------
  {
    id: 'concrete-cure-scheduler',
    trade: 'Concrete, foundation & epoxy',
    name: 'Predictive pour and cure scheduler',
    summary:
      'Combines microclimate weather with the specific mix to find the optimal pouring window, and texts crew and client when it shifts.',
    audience: 'contractor',
    inputs: 'Job site, scheduled date, mix specification.',
    pipeline: 'Weather API, a scheduling model, SMS.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Low per contractor, but demands real correctness.',
    origin: 'research-list',
    verdict:
      'Park it, and be clear about why: getting this wrong ruins a pour worth thousands. That is a liability surface, not a lead magnet, and it needs materials expertise this project does not have. The epoxy quoting tool is the right product for this trade.',
  },

  // -- Painting -------------------------------------------------------------
  {
    id: 'painting-video-quoter',
    trade: 'Painting',
    name: 'Video-pan room quoter',
    summary:
      'Customer pans their phone around a room. Vision computes wall square footage, subtracting doors and windows, and quotes labour and gallons.',
    audience: 'homeowner',
    inputs: 'A short video pan of the room.',
    pipeline:
      'Frame extraction from video, then multi-frame vision. The existing vision path already reasons across several frames in one call.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: '$2,000-$8,000',
    feasibility: 'needs-new-capability',
    costShape:
      'One multi-frame vision call. No render at all, so far cheaper per lead than epoxy.',
    origin: 'research-list',
    verdict:
      'Good, and cheap to run. The new capability is video frame extraction, which is modest. Worth noting the honest limit: subtracting doors and windows accurately from a pan is harder than it sounds, so the confidence machinery and the manual override matter more here than anywhere else.',
  },
  {
    id: 'painting-lighting-simulator',
    trade: 'Painting',
    name: 'Colour-under-lighting simulator',
    summary:
      'Renders a chosen paint colour on the room, then shows it under morning daylight versus evening artificial light.',
    audience: 'homeowner',
    inputs: 'One room photo and a colour.',
    pipeline: 'Two renders of the same room under different lighting.',
    needsImageGeneration: true,
    viral: 'high',
    ticket: '$2,000-$8,000',
    feasibility: 'ready',
    costShape:
      'TWO renders per lead by definition — the comparison is the product. Twice epoxy per lead.',
    origin: 'research-list',
    verdict:
      'Excellent hook. "The colour you picked looks like this at 7pm" answers the single most common repaint regret, and the split-screen is inherently shareable. Watch the doubled render cost, and note that the painting vertical module already exists in scaffold form, so the surrounding work is smaller than it looks.',
  },

  // -- HVAC -----------------------------------------------------------------
  {
    id: 'hvac-load-widget',
    trade: 'HVAC',
    name: 'Self-serve load calculation widget',
    summary:
      'Homeowner types an address; public property data gives square footage, year built and ceiling height, producing required tonnage and a quote.',
    audience: 'homeowner',
    inputs: 'An address.',
    pipeline: 'Property data API plus the quote kit. No vision, no render.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: '$5,000-$15,000',
    feasibility: 'needs-new-capability',
    costShape: 'One API call per lead. Near zero.',
    origin: 'research-list',
    verdict:
      'Sound and unglamorous. Nobody shares a tonnage calculation, so it will not grow on its own, but it converts and costs nothing to run. Build it after something with a visual surface has brought people to the site.',
  },
  {
    id: 'hvac-predictive-maintenance',
    trade: 'HVAC',
    name: 'Predictive maintenance outreach',
    summary:
      'Tracks system age against forecast heatwaves and texts owners of older units to book a tune-up before failure.',
    audience: 'contractor',
    inputs: 'An existing customer list.',
    pipeline: 'Weather API, scheduler, SMS.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software.',
    feasibility: 'needs-new-capability',
    costShape: 'Negligible.',
    origin: 'research-list',
    verdict:
      'Same shape as the roofing storm tracker: real value, no acquisition surface, requires a customer list the contractor already has. Park it with the others.',
  },
  {
    id: 'hvac-acoustic-diagnostic',
    trade: 'HVAC',
    name: 'Acoustic fault diagnostic',
    summary:
      'A technician records five seconds of a rattling unit and photographs the board; the tool cross-references sound and image to name the failed part.',
    audience: 'contractor',
    inputs: 'An audio clip and a photo.',
    pipeline: 'Audio model plus vision. Neither exists here.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Unknown. Audio inference is not on the current provider path.',
    origin: 'research-list',
    verdict:
      'The most interesting idea in the list and the wrong one to build now. Diagnosing from sound needs training data nobody here has, and a confident wrong diagnosis sends a technician out with the wrong part. Impressive demo, dangerous product.',
  },

  // -- Plumbing -------------------------------------------------------------
  {
    id: 'plumbing-triage-quoter',
    trade: 'Plumbing',
    name: 'Photo triage and repair-or-replace quoter',
    summary:
      'Homeowner photographs a leaking water heater. Label recognition identifies model and age, returning repair and replace quotes plus a parts list.',
    audience: 'homeowner',
    inputs: 'One photo of the unit.',
    pipeline:
      'A vision call reading a label — close to what the measurement path already does, aimed at text rather than dimensions.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: '$1,500-$4,000',
    feasibility: 'ready',
    costShape: 'One vision call. Cheap.',
    origin: 'research-list',
    verdict:
      'Genuinely buildable now and converts well because the homeowner is already in trouble when they use it. Not shareable — nobody posts their broken water heater — so treat it as a conversion tool, not a growth one.',
  },
  {
    id: 'plumbing-acoustic-leak-map',
    trade: 'Plumbing',
    name: 'Acoustic leak mapper',
    summary:
      'Phone held to drywall filters ambient noise to isolate the hiss of a leak, drawing a heat map of where to cut.',
    audience: 'contractor',
    inputs: 'Live audio through the phone microphone.',
    pipeline: 'Real-time signal processing. Nothing like it exists here.',
    needsImageGeneration: false,
    viral: 'high',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'On-device processing; cheap to run, expensive to build.',
    origin: 'research-list',
    verdict:
      'Would go viral if it worked, and phone microphones are probably not sensitive enough to make it work reliably. Cutting a hole in the wrong wall on the tool\'s advice is the failure mode. Not now.',
  },

  // -- Site preparation -----------------------------------------------------
  {
    id: 'siteprep-dirt-quoter',
    trade: 'Site preparation & dirt work',
    name: 'Satellite topographic dirt removal quoter',
    summary:
      'User draws a box on satellite view; topographic data gives cubic yards of spoil, quoting machine hours and truck loads.',
    audience: 'homeowner',
    inputs: 'An address and a drawn rectangle.',
    pipeline: 'Maps plus elevation data, then arithmetic.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: '$5,000-$30,000',
    feasibility: 'needs-new-capability',
    costShape: 'API calls only.',
    origin: 'research-list',
    verdict:
      'Shares its entire foundation with the roofing satellite quoter — build that first and this becomes a second use of the same capability rather than a new project.',
  },

  // -- Framing & drywall ----------------------------------------------------
  {
    id: 'framing-blueprint-takeoff',
    trade: 'Framing & drywall',
    name: 'PDF blueprint takeoff parser',
    summary:
      'Contractor drops in a PDF floor plan; the tool parses dimensions and produces a materials takeoff and a quote.',
    audience: 'contractor',
    inputs: 'A PDF plan.',
    pipeline: 'PDF parsing plus vision on rendered pages.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: 'Sold as software.',
    feasibility: 'needs-new-capability',
    costShape: 'Several vision calls per document. Moderate.',
    origin: 'research-list',
    verdict:
      'Real demand and a hard accuracy bar — a takeoff that is 5% wrong loses money on every job. Contractor-facing, so no viral surface. Later.',
  },
  {
    id: 'framing-cut-optimiser',
    trade: 'Framing & drywall',
    name: 'Cut-list optimiser',
    summary:
      'Computes the cutting sequence that minimises offcut waste from a digital plan.',
    audience: 'contractor',
    inputs: 'A takeoff list.',
    pipeline: 'A bin-packing solver. No AI required at all.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: 'Sold as software.',
    feasibility: 'ready',
    costShape: 'Free to run. It is pure computation.',
    origin: 'research-list',
    verdict:
      'Cheapest thing in this file to build and run, and it needs the takeoff parser above to have any input. Meaningless on its own.',
  },

  // -- Fencing --------------------------------------------------------------
  {
    id: 'fencing-perimeter-quoter',
    trade: 'Fencing',
    name: 'Map-based perimeter quoter',
    summary:
      'Customer taps the corners of their yard on a satellite map; the tool computes linear footage, takes a material choice and quotes instantly.',
    audience: 'homeowner',
    inputs: 'An address and a few taps.',
    pipeline: 'Maps API and geometry. No AI at all.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: '$3,000-$12,000',
    feasibility: 'needs-new-capability',
    costShape:
      'A maps API call. No inference whatsoever, so effectively free per lead.',
    origin: 'research-list',
    builtAs: 'fencing',
    verdict:
      'BUILT — phase 78, as lib/verticals/fencing, migration 0027. NOTE THAT IT WAS BUILT DIFFERENTLY FROM THIS ENTRY. The entry below describes a map-tap calculator, and the verdict that it was not shareable was correct about THAT design. It ships instead on the photo-and-render path like every other vertical: a homeowner sees the fence standing on their own property, which is shareable, and the satellite perimeter becomes an accuracy upgrade to the measurement rather than a prerequisite for the tool. The original note still applies to the calculator form: Tapping your own property line is satisfying, the arithmetic is exact rather than estimated — so no confidence problem and no manual override needed — and it costs nothing to serve. The best non-AI tool here.',
  },

  // -- Flooring -------------------------------------------------------------
  {
    id: 'flooring-room-visualiser',
    trade: 'Flooring',
    name: 'Room scan and floor visualiser',
    summary:
      'Homeowner photographs existing carpet; the tool identifies the floor area, superimposes hardwood or tile and quotes the square footage.',
    audience: 'homeowner',
    inputs: 'One photo of the room.',
    pipeline:
      'Identical to epoxy. Same measurement, same render, different catalogue.',
    needsImageGeneration: true,
    viral: 'high',
    ticket: '$3,000-$15,000',
    feasibility: 'ready',
    costShape: 'One render per lead. Same as epoxy.',
    origin: 'research-list',
    verdict:
      'The single closest thing to the tool that already works — a floor is a floor. Cheapest new vertical to reach quality, because the geometry, the measurement prompt and the render prompt all transfer. Lower drama than exterior work, since carpet to hardwood is a smaller visual leap than a bare slab to metallic epoxy.',
  },

  // -- Pool -----------------------------------------------------------------
  {
    id: 'pool-zoning-checker',
    trade: 'Pool builders',
    name: 'Zoning and utility cross-reference',
    summary:
      'Checks a designed pool against city zoning and buried utility data, flagging setback and pipe conflicts.',
    audience: 'contractor',
    inputs: 'An address and a proposed pool footprint.',
    pipeline: 'Municipal zoning and utility APIs, where they exist.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Data licensing is the real cost, not inference.',
    origin: 'research-list',
    verdict:
      'Blocked on data availability, which varies by municipality and is often not an API at all. Telling a builder the ground is clear when it is not is a gas line. No.',
  },

  // -- Solar & electrical ---------------------------------------------------
  {
    id: 'solar-sun-exposure-calculator',
    trade: 'Solar & electrical',
    name: 'Roof sun exposure and panel capacity calculator',
    summary:
      'Reads amperage from a photo of the electrical panel, combines it with satellite sun exposure, and quotes the array plus any service upgrade.',
    audience: 'homeowner',
    inputs: 'An address and one photo of the open panel.',
    pipeline: 'Satellite irradiance data plus a vision call reading the panel.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: '$15,000-$40,000',
    feasibility: 'needs-new-capability',
    costShape: 'One vision call and one data call.',
    origin: 'research-list',
    verdict:
      'Highest ticket in the file. Two concerns: asking a homeowner to open their electrical panel and photograph it is a real friction and arguably a safety prompt, and solar lead generation is the most competitive space in home services. Strong economics, hard market.',
  },
  {
    id: 'electrical-panel-mapper',
    trade: 'Solar & electrical',
    name: 'Breaker panel mapper',
    summary:
      'Reads handwritten breaker labels via OCR and produces a clean digital schematic of the panel.',
    audience: 'contractor',
    inputs: 'A photo of the panel door.',
    pipeline: 'OCR on difficult handwriting.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: 'Sold as software.',
    feasibility: 'ready',
    costShape: 'One vision call. Cheap.',
    origin: 'research-list',
    verdict:
      'Buildable today and pleasant, but it is a utility rather than a lead source — it reads a label, it does not sell a job. Good free giveaway to attract electricians if you ever sell to them directly.',
  },

  // -- Cabinetry ------------------------------------------------------------
  {
    id: 'cabinetry-lidar-scan',
    trade: 'Cabinetry & millwork',
    name: 'LiDAR kitchen scan to CAD',
    summary:
      'An iPad Pro scan builds a millimetre-accurate mesh, detects out-of-square walls and exports CAD for CNC.',
    audience: 'contractor',
    inputs: 'A LiDAR scan from specific hardware.',
    pipeline: 'Mesh processing and CAD export.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Not an inference cost; an engineering cost.',
    origin: 'research-list',
    verdict:
      'Requires hardware the customer must own and CAD/CNC expertise. Furthest from this stack of anything listed. No.',
  },

  // -- Masonry --------------------------------------------------------------
  {
    id: 'masonry-brick-matcher',
    trade: 'Masonry & bricklaying',
    name: 'Brick and mortar matcher',
    summary:
      'Photographs an existing wall and recommends brick SKUs and mortar dye for a seamless repair match.',
    audience: 'contractor',
    inputs: 'A photo of the wall.',
    pipeline: 'A vision call plus a supplier SKU database.',
    needsImageGeneration: false,
    viral: 'medium',
    ticket: 'Sold as software.',
    feasibility: 'needs-new-capability',
    costShape: 'One vision call; the database is the work.',
    origin: 'research-list',
    verdict:
      'Solves a real and irritating problem. Blocked on a supplier catalogue with accurate colour data, which does not exist in a usable form and would have to be assembled by hand.',
  },

  // -- Fire protection ------------------------------------------------------
  {
    id: 'fire-code-checker',
    trade: 'Fire protection',
    name: 'Sprinkler code compliance checker',
    summary:
      'Checks a system layout against local fire code, highlighting coverage gaps and pipe sizing violations before submission.',
    audience: 'contractor',
    inputs: 'A system drawing.',
    pipeline: 'Drawing parsing plus a codified rule set per municipality.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Codifying fire code per jurisdiction is the entire project.',
    origin: 'research-list',
    verdict:
      'No. A tool that says a life-safety layout is compliant when it is not carries liability this company cannot absorb.',
  },

  // -- Elevator -------------------------------------------------------------
  {
    id: 'elevator-predictive-failure',
    trade: 'Elevator & escalator',
    name: 'IoT predictive failure dashboard',
    summary:
      'Vibration and acoustic sensors on motors feed a baseline model that dispatches a technician on anomaly.',
    audience: 'contractor',
    inputs: 'Installed hardware sensors and a live feed.',
    pipeline: 'Time-series anomaly detection over streamed sensor data.',
    needsImageGeneration: false,
    viral: 'none',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Hardware, connectivity and continuous ingestion.',
    origin: 'research-list',
    verdict:
      'A different company. Hardware deployment, industrial sales cycles, and safety certification. No.',
  },

  // -- Waterproofing --------------------------------------------------------
  {
    id: 'waterproofing-thermal-scanner',
    trade: 'Waterproofing',
    name: 'Thermal water path scanner',
    summary:
      'A phone thermal attachment scans a basement wall; temperature gradients trace the water path back to the entry point.',
    audience: 'contractor',
    inputs: 'A thermal camera attachment.',
    pipeline: 'Thermal image analysis.',
    needsImageGeneration: false,
    viral: 'high',
    ticket: 'Sold as software.',
    feasibility: 'heavy',
    costShape: 'Requires hardware the contractor must buy.',
    origin: 'research-list',
    verdict:
      'Compelling and gated behind a hardware purchase, which collapses the addressable market to contractors who already own thermal cameras. No.',
  },

  // ==========================================================================
  // ADDED HERE — trades and tools the research list did not cover.
  // ==========================================================================
  {
    id: 'exterior-painting-visualiser',
    trade: 'Painting (exterior)',
    name: 'Exterior house colour visualiser',
    summary:
      'Homeowner photographs their house from the street and sees it repainted in any colour scheme, with a quote attached.',
    audience: 'homeowner',
    inputs: 'One street-level photo of the house.',
    pipeline:
      'The epoxy pipeline almost unchanged. Exterior walls are large flat planes photographed from standing height, which is the exact case the render prompt was tuned for.',
    needsImageGeneration: true,
    viral: 'high',
    ticket: '$8,000-$20,000',
    feasibility: 'ready',
    costShape: 'One render per lead under the phase 67 cap.',
    origin: 'added',
    verdict:
      'The strongest candidate in this entire file, and the research list omitted it — it covers interior painting twice and never the exterior. "My house in eight colours" is a thing people send to their spouse, which is organic distribution no advertising budget buys. The painting vertical module already exists in scaffold form. Highest ratio of impact to remaining work.',
  },
  {
    id: 'cabinet-refinishing-visualiser',
    trade: 'Cabinetry (refinishing)',
    name: 'Kitchen cabinet refinishing visualiser',
    summary:
      'Homeowner photographs their kitchen and sees the cabinets refinished in a chosen colour and hardware style, quoted by door count.',
    audience: 'homeowner',
    inputs: 'One photo of the kitchen.',
    pipeline: 'Render plus a vision call counting cabinet doors for the quote.',
    needsImageGeneration: true,
    viral: 'high',
    ticket: '$4,000-$10,000',
    feasibility: 'ready',
    costShape: 'One render and one vision call per lead.',
    origin: 'added',
    builtAs: 'cabinets',
    verdict:
      'BUILT — phase 76, as lib/verticals/cabinets, with a tool page. Priced per door and drawer front rather than by area, because a door is a unit of work whose cost barely varies with its size; migration 0026. The research list has cabinetry only as contractor LiDAR software and misses the homeowner-facing version entirely, which is the one that generates leads. Dark cabinets going white is among the most shared before-and-afters online. Harder than a floor — many small faces rather than one plane — but well inside what the pipeline does.',
  },
  {
    id: 'garage-door-visualiser',
    trade: 'Garage doors',
    name: 'Garage door replacement visualiser',
    summary:
      'Street photo of the house with the garage door swapped for different styles, quoted by size.',
    audience: 'homeowner',
    inputs: 'One photo of the front of the house.',
    pipeline: 'A render replacing a single well-defined rectangle.',
    needsImageGeneration: true,
    viral: 'medium',
    ticket: '$2,000-$6,000',
    feasibility: 'ready',
    costShape: 'One render per lead.',
    origin: 'added',
    verdict:
      'An entire trade the research list skips. The easiest render target in this file — a garage door is a flat rectangle facing the camera — and it pairs naturally with the epoxy tool, since the same homeowner is already looking at their garage.',
  },
  {
    id: 'deck-resurfacing-visualiser',
    trade: 'Decking',
    name: 'Deck staining and resurfacing visualiser',
    summary:
      'Photo of a weathered deck restained or rebuilt in composite, quoted by square footage.',
    audience: 'homeowner',
    inputs: 'One photo of the deck.',
    pipeline: 'Same as epoxy. A deck is a floor outdoors.',
    needsImageGeneration: true,
    viral: 'medium',
    ticket: '$3,000-$15,000',
    feasibility: 'ready',
    costShape: 'One render per lead.',
    origin: 'added',
    verdict:
      'Grey weathered wood to rich stain is a strong before-and-after and the surface is a plane at a shallow angle, which the floor pipeline already handles. Seasonal in cold markets.',
  },
  {
    id: 'gutter-linear-quoter',
    trade: 'Gutters',
    name: 'Satellite gutter run quoter',
    summary:
      'Roofline traced from satellite imagery gives linear footage for gutters and guards, quoted instantly from an address.',
    audience: 'homeowner',
    inputs: 'An address.',
    pipeline: 'The same satellite measurement capability as roofing.',
    needsImageGeneration: false,
    viral: 'low',
    ticket: '$1,500-$5,000',
    feasibility: 'needs-new-capability',
    costShape: 'One maps call per lead.',
    origin: 'added',
    verdict:
      'Only worth building as a third use of the satellite measurement capability, alongside roofing and site prep. On its own the ticket does not justify the work.',
  },
] as const;

/**
 * ============================================================================
 * THE SHAPE EVERY TOOL TAKES. THIS IS NOT OPTIONAL AND NOT PER-TOOL.
 * ============================================================================
 *
 * The epoxy tool works and is the proof the pipeline is sound. Its FLOW is not
 * the thing to copy. Every tool after it uses the shape below, and a tool that
 * departs from it needs a reason written down next to the departure.
 *
 *   1. HOOK — A BIG PICTURE, IMMEDIATELY.
 *      The first thing on screen is a large image of the visitor's own
 *      property. Not a headline, not a form, not an explanation of what the
 *      tool does. A person who has just uploaded a photograph of their yard
 *      should see their yard, large, before anything else is asked of them.
 *      This is the moment attention is won or lost, and it is also the "before"
 *      half of the before-and-after the whole tool is building towards.
 *
 *   2. CUSTOMISE — THE CHOICES, AND ONLY THE CHOICES.
 *      Style, colour, material. Nothing about measurement, nothing about
 *      price, no forms. Progressive reveal: a question appears when the answer
 *      before it makes it relevant, and questions that do not apply are not
 *      shown at all.
 *
 *   3. FORM — ONE GATE, PLACED AFTER DESIRE EXISTS.
 *      Contact details are asked for once the visitor wants the result, not
 *      before. Asking earlier converts worse and deserves less.
 *
 *   4. OUTPUT — THE AFTER, BIGGER THAN ANYTHING ELSE ON THE PAGE.
 *      The rendered result is the largest element in the tool, with the price,
 *      the measured size and every supporting detail arranged beneath it. Not
 *      beside it, not above it. The picture is the product; the numbers
 *      substantiate it.
 *
 * SIMPLER THAN EPOXY, DELIBERATELY. Epoxy accumulated a photo count minimum, a
 * measurement step of its own, and a size announcement before the picker.
 * Phases 57 and 65 removed most of that — one photograph is enough, the
 * measurement happens quietly, and the size arrives with the price. New tools
 * start where epoxy ended up rather than repeating the route it took.
 *
 * WHAT THIS MEANS CONCRETELY WHEN BUILDING A MODULE:
 *   - One photograph is the minimum. Never refuse a visitor for sending one.
 *   - The measurement is never its own step and never announced on its own.
 *   - Images are shown large and uncropped: fit them, never crop to a fixed
 *     ratio. See app/phase62.css for what that took to correct once.
 *   - Text goes below pictures, never above them. See app/phase64.css.
 *   - One paid render per visitor. See MAX_RENDERED_PHOTOS in ToolCard.
 *
 * ============================================================================
 * CAPABILITIES THAT DO NOT EXIST YET — AND ARE NOT BLOCKED
 * ============================================================================
 *
 * SEVERAL ENTRIES ABOVE ARE MARKED `needs-new-capability`. THAT MEANS NOT YET
 * BUILT. IT DOES NOT MEAN HARD, RISKY, OR OUT OF REACH, AND IT SHOULD NOT BE
 * READ AS A REASON TO DECLINE.
 *
 * This section exists so that an assistant picking this file up in a fresh
 * session has what it needs to start, rather than treating the label as a wall.
 * Each entry states what the capability is, the concrete approach, what is
 * genuinely uncertain, and what has to be true before a line is written.
 *
 * ONLY THREE ARE DOCUMENTED, AND THE OMISSIONS ARE DELIBERATE. Several other
 * entries are also marked `needs-new-capability` without a matching entry here:
 * the storm tracker, HVAC maintenance outreach, the landscaping bill of
 * materials, blueprint takeoff, the HVAC load widget and the brick matcher.
 * Each is either a park-it verdict, blocked on data that has to be assembled by
 * hand rather than on code, or — in the bill of materials case — an idea that
 * should be redesigned before it is built at all. Writing build notes for them
 * would imply a recommendation this file does not make. If one is chosen, its
 * capability entry gets written then.
 */

export interface UnbuiltCapability {
  id: string;
  name: string;
  /** Which TOOL_IDEAS entries become buildable once this exists. */
  unlocks: readonly string[];
  /** The concrete approach. Specific enough to start from. */
  approach: string;
  /** What is genuinely uncertain, stated plainly. */
  risks: string;
  /** What must be true or obtained before writing code. */
  prerequisites: string;
  /** Rough size, in the only unit that matters here: sessions of work. */
  effort: string;
  /**
   * What of this capability now exists. PHASE 79.
   *
   * Optional, because most capabilities are all-or-nothing. Satellite
   * measurement turned out not to be: its arithmetic and its network calls have
   * completely different risk profiles, and recording only "not built" would
   * hide that half of it is done and tested.
   */
  progress?: string;
}

export const UNBUILT_CAPABILITIES: readonly UnbuiltCapability[] = [
  {
    id: 'satellite-measurement',
    name: 'Measuring a property from an address',
    unlocks: [
      'roofing-satellite-quoter',
      'fencing-perimeter-quoter',
      'siteprep-dirt-quoter',
      'gutter-linear-quoter',
      /* The same Google Solar API call that returns roof geometry also returns
         sun exposure, so this comes almost free once roofing is integrated —
         the panel-reading vision call is separate and already possible. */
      'solar-sun-exposure-calculator',
    ],
    approach:
      "Three separate problems that share one integration. ROOF AREA AND PITCH: Google's Solar API building-insights endpoint returns roof segments for an address with area, pitch and azimuth already computed — the hard part is solved by someone else, and pitch is what makes it worth using, since a flat footprint underestimates real roof area by anywhere from 5% to 40% depending on slope. PERIMETER: no AI and no model at all — the customer taps the corners of their property on a map and the tool computes geodesic distance between consecutive points. That is pure arithmetic, exactly correct rather than estimated, and testable offline. EXCAVATION VOLUME: an elevation API gives surface topography, and the user supplies the design depth, which the tool must ASK FOR rather than assume.",
    risks:
      "The integration cannot be tested without a live API key and network access, so it will be written-unverified until it runs against the real endpoint — the one category of work this codebase has been burned by. Mitigate with the pattern already used everywhere here: parse every response against a strict schema and fall through to manual entry the moment anything fails to validate, rather than trusting a shape. Coverage is good in the US and patchy elsewhere, which is fine for a Dallas-Fort Worth market and must not be assumed beyond it. The perimeter tool carries almost none of this risk and is the sensible thing to build first.",
    prerequisites:
      'A Google Maps Platform project with billing enabled and the Solar API and Elevation API turned on. Check billing BEFORE writing code — the endpoints return an authorisation error rather than data without it, and that failure looks exactly like a bug.',
    effort:
      'Perimeter alone: small, and self-contained. Roofing with real pitch data: moderate, dominated by response handling rather than arithmetic. Once either exists the remaining tools are mostly catalogue and copy.',
    progress:
      'PARTLY BUILT - phase 79. lib/measure/geo.ts is the arithmetic half: geodesic distance, open-path length, closed perimeter and polygon area from tapped coordinates. No API key, no network, no billing account, and VERIFIED rather than asserted - checked against the JFK-LAX great circle, a degree of latitude, a degree of longitude at Dallas latitude, and a constructed 100x50m rectangle, all within 0.25 percent. Splitting the capability this way was the point: the maths could be proven offline while the fetching half stays honestly untested. STILL MISSING: a map component to produce the taps, and the Google Solar and Elevation calls for roof pitch and terrain.',
  },
  {
    id: 'video-frame-extraction',
    name: 'Pulling still frames from a phone video',
    unlocks: ['painting-video-quoter'],
    approach:
      'Sample frames client-side by drawing a <video> element to a canvas at intervals, which is the same browser API lib/finishes/resize.ts already uses for downscaling. Feed the chosen frames into the existing multi-frame vision path, which was built to reason across several views in one call and needs no change.',
    risks:
      'Choosing WHICH frames matters more than extracting them — a blurred pan produces confident nonsense. Prefer sharpness-scored frames over fixed intervals.',
    prerequisites: 'None. Everything needed is already in the browser.',
    effort: 'Small. The vision side already exists.',
  },
  {
    id: 'render-caching',
    name: 'Not paying twice for the same render',
    unlocks: [],
    approach:
      'Key a stored render on a hash of the photo bytes plus the serialised selections. A repeat of an identical request returns the stored image and costs nothing.',
    risks:
      'Almost none. The correctness question is only whether the key captures everything that changes the output — photo and selections are the whole input to the render call.',
    prerequisites: 'Somewhere to store the mapping. The media bucket already exists.',
    effort:
      'Small, and the highest-value item in this entire file for running cost. Recording an advert currently regenerates the same image on every take.',
  },
] as const;

/**
 * ============================================================================
 * THE RECOMMENDATION
 * ============================================================================
 *
 * Three tools, chosen on one criterion: a large flat surface a homeowner can
 * photograph from where they are standing, attached to a job worth enough that
 * a lead pays for the render several times over.
 *
 * All three are `feasibility: 'ready'` — they need no capability that does not
 * exist. They are the epoxy pipeline pointed at a different surface, which is
 * precisely what the vertical module system was built for.
 *
 * NOTE WHAT IS NOT HERE. The satellite quoters (roofing, fencing, site prep,
 * gutters) may well be better BUSINESS than two of these: near-zero serving
 * cost, exact arithmetic instead of estimates, and no confidence problem. They
 * are excluded only because they need a measurement capability that does not
 * exist yet. If cost per lead is the priority rather than reach, build the
 * satellite capability first and get four tools out of one piece of work.
 */
export const SHORTLIST: readonly string[] = [
  /*
   * Weedy dirt to a finished patio, and turf as a style within it. The most
   * legible transformation available and one that needs no context at all —
   * a viewer who has never thought about landscaping still sees it.
   */
  'landscaping-visualiser',
  /*
   * A whole house changes colour in one cut. The largest frame-filling delta
   * here, and the only one with an engagement mechanic built in: "which
   * colour?" invites argument, and argument travels further than approval.
   * The painting module already exists in scaffold form.
   */
  'exterior-painting-visualiser',
  /*
   * Dark dated kitchen to bright white. An enormous online genre, instantly
   * readable, and it does not cannibalise the yard tool the way a standalone
   * turf tool would — different room, different moment, same pipeline.
   */
  'cabinet-refinishing-visualiser',
] as const;

/**
 * STATUS, AS OF PHASE 77.
 *
 *   landscaping-visualiser          BUILT (phases 71, 75)
 *   cabinet-refinishing-visualiser  BUILT (phase 76)
 *   exterior-painting-visualiser    BLOCKED
 *
 * The exterior tool is not blocked on content — phase 72 shipped its colour
 * decks. It is blocked on a chain of contract changes documented in
 * HANDOFF-4 section 3, of which the load-bearing one is that `WidgetConfig`
 * carries no colour collections at all, so a body/trim/accent picker has
 * nothing to read. Do not start it by writing a module; start by finding
 * whatever builds WidgetConfig.
 *
 * ALSO WORTH KNOWING BEFORE BUILDING A FOURTH: as of phase 77, none of the four
 * tools now registered has been observed running. Adding a fifth surface before
 * one of them is verified adds risk rather than progress.
 */

/**
 * ============================================================================
 * THE RANKING CRITERION, WHICH IS NOT THE OBVIOUS ONE
 * ============================================================================
 *
 * These three are NOT ranked by ticket size or by cost per lead. They are
 * ranked by whether a stranger with no interest in the trade would stop
 * scrolling, because the growth loop runs through people who are not the
 * customer:
 *
 *   an uninterested viewer watches the transformation and likes it
 *     -> the video reaches more people
 *       -> a CONTRACTOR eventually sees it
 *         -> he wants it on his own website
 *
 * The homeowner using the tool is not the buyer. The contractor watching the
 * output travel is. That inverts the usual ranking, and it is why the satellite
 * quoters are absent from this shortlist despite probably being better
 * businesses: near-zero serving cost, exact arithmetic, no confidence problem —
 * and their output is a NUMBER. Nobody has ever shared a number.
 *
 * If the priority ever shifts from reach to cost per lead, the shortlist should
 * change with it. Build the satellite capability and take four tools from one
 * piece of work.
 */

/** Look up one idea by id. Present so the file has an entry point. */
export function findToolIdea(id: string): ToolIdea | null {
  return TOOL_IDEAS.find((t) => t.id === id) ?? null;
}
