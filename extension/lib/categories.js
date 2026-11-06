/**
 * Common Google Business Profile categories (named the way Google names them) and the words a business's own website uses for each. Used to work out
 * what a business does from its title, description, headings, menu and schema, instead of guessing from one heading.
 * Each line: category: trigger phrase, trigger phrase, ... Triggers are matched as whole words (a trailing "s" allowed).
 * More specific categories come first, so "roof repair" picks roofing contractor before general contractor.
 */
const TABLE = `
lighting contractor: lighting contractor, permanent lighting, permanent lights, permanent outdoor lighting, permanent christmas lights, govee, jellyfish lighting, trimlight, eave lighting, landscape lighting, outdoor lighting, lighting installation, led lighting, holiday lighting, holiday light installation, christmas light installation
roofing contractor: roofing, roofer, roof repair, roof replacement, roof installation, shingle, metal roof, roof inspection
gutter cleaning service: gutter cleaning, gutter guard, gutters, gutter installation, seamless gutter
siding contractor: siding, vinyl siding, fiber cement, enviroshake, cedar shake
window installation service: window replacement, replacement window, window installation, new windows
plumber: plumbing, plumber, drain cleaning, water heater, sewer line, clogged drain, leak repair, sump pump, pipe repair, septic
hvac contractor: hvac, heating and air, heating and cooling, air conditioning, furnace, heat pump, ac repair, ductless, mini split, boiler
electrician: electrician, electrical contractor, electrical service, panel upgrade, wiring, ev charger installation, generator installation
solar energy contractor: solar panel, solar installation, solar energy, solar installer
kitchen remodeler: kitchen remodel, kitchen remodeling, kitchen renovation, custom cabinet, countertop
bathroom remodeler: bathroom remodel, bathroom remodeling, bathroom renovation, shower remodel, walk in tub
basement remodeler: basement finishing, basement remodel, finished basement
remodeler: remodeling, remodeler, renovation, home improvement, interior remodeling, home addition
deck builder: deck builder, deck building, composite deck, deck installation, porch
fence contractor: fence, fencing, fence installation
concrete contractor: concrete, stamped concrete, driveway, patio, hardscape, paver
masonry contractor: masonry, brick, stonework, chimney repair, retaining wall
painter: painting contractor, house painting, interior painting, exterior painting, painter, cabinet painting
flooring contractor: flooring, hardwood floor, vinyl plank, tile installation, carpet installation, laminate
drywall contractor: drywall, plaster repair
insulation contractor: insulation, spray foam, attic insulation
waterproofing service: basement waterproofing, waterproofing, foundation repair, crawl space
home builder: home builder, custom home, new home construction, custom built home
general contractor: general contractor, construction company, commercial construction, design build, contractor
handyman: handyman, handyman service, home repair, odd jobs
landscaper: landscaping, landscaper, landscape design, mulch, sod, garden design
lawn care service: lawn care, lawn mowing, lawn service, fertilization, weed control, aeration
tree service: tree service, tree removal, tree trimming, stump grinding, arborist
snow removal service: snow removal, snow plowing
pest control service: pest control, exterminator, termite, bed bug, rodent, mosquito control
house cleaning service: house cleaning, maid service, home cleaning, deep cleaning, move out cleaning
commercial cleaning service: commercial cleaning, janitorial, office cleaning
carpet cleaning service: carpet cleaning, upholstery cleaning, rug cleaning
pressure washing service: pressure washing, power washing, soft washing, house washing
window cleaning service: window cleaning
junk removal service: junk removal, junk hauling, dumpster rental, debris removal
moving company: moving company, movers, moving service, packing service, relocation
self-storage facility: self storage, storage unit
garage door supplier: garage door
locksmith: locksmith, lockout, rekey, lock change
appliance repair service: appliance repair, washer repair, dryer repair, refrigerator repair
pool contractor: pool installation, pool builder, swimming pool, pool service, pool cleaning, hot tub
water damage restoration service: water damage, mold remediation, fire damage, restoration, water cleanup, flood cleanup
home inspector: home inspection, home inspector, radon testing
security system supplier: security system, home security, alarm system, security camera
audio visual consultant: home theater, audio visual, smart home, tv mounting
interior designer: interior design, interior designer
architect: architect, architecture firm
real estate agent: real estate agent, realtor, homes for sale, real estate, listing agent, buyer agent
property management company: property management, property manager
mortgage lender: mortgage, home loan, refinance
insurance agency: insurance agency, insurance agent, auto insurance, home insurance, life insurance
financial planner: financial planning, financial advisor, wealth management, retirement planning
accountant: accounting, accountant, cpa, bookkeeping, tax preparation, payroll
tax preparation service: tax preparation, tax return, tax service
law firm: law firm, attorney, lawyer, legal service
personal injury attorney: personal injury, car accident lawyer, injury attorney
family law attorney: family law, divorce, child custody
criminal justice attorney: criminal defense, dui lawyer, criminal lawyer
estate planning attorney: estate planning, wills, trusts, probate
marketing agency: marketing agency, digital marketing, seo, search engine optimization, social media marketing, ppc, advertising agency
website designer: web design, website design, web designer, website development, web development
software company: software, saas, app development, platform
computer repair service: computer repair, laptop repair, it support, managed it, data recovery
cell phone store: phone repair, iphone repair, screen repair, cell phone
photographer: photography, photographer, wedding photography, portrait, headshot
videographer: videography, videographer, video production
wedding venue: wedding venue, event venue, banquet hall, reception venue
event planner: event planning, wedding planner, event planner
caterer: catering, caterer
florist: florist, flower delivery, floral, bouquet
dentist: dentist, dental, teeth cleaning, dental implant, invisalign, cosmetic dentistry
orthodontist: orthodontist, orthodontics, braces
pediatric dentist: pediatric dentist, kids dentist
chiropractor: chiropractor, chiropractic, spinal adjustment
physical therapy clinic: physical therapy, physical therapist, sports rehab
medical clinic: medical clinic, primary care, family medicine, urgent care, physician
dermatologist: dermatology, dermatologist, skin care clinic
optometrist: optometrist, eye exam, eye doctor, eyeglasses, contact lenses
medical spa: med spa, medical spa, botox, filler, laser hair removal, coolsculpting
massage therapist: massage, massage therapy, deep tissue
counselor: counseling, therapist, therapy, mental health, psychologist
veterinarian: veterinarian, veterinary, animal hospital, vet clinic, pet clinic
pet groomer: pet grooming, dog grooming, groomer
dog trainer: dog training, dog trainer, puppy training
kennel: dog boarding, pet boarding, doggy daycare, kennel
gym: gym, fitness center, personal training, crossfit, workout
yoga studio: yoga, yoga studio, pilates
martial arts school: martial arts, karate, jiu jitsu, taekwondo, mma
dance school: dance studio, dance school, dance class, ballet
music school: music lessons, music school, piano lessons, guitar lessons
tutoring service: tutoring, tutor, test prep
preschool: preschool, daycare, child care, childcare, early learning
hair salon: hair salon, haircut, hair stylist, hair color, balayage, blowout
barber shop: barber, barbershop, barber shop, fade, beard trim
nail salon: nail salon, manicure, pedicure, nails, gel nails
beauty salon: beauty salon, lash extensions, eyelash, brow, waxing, makeup artist
day spa: day spa, spa, facial
tattoo shop: tattoo, tattoo shop, piercing
pizza restaurant: pizza, pizzeria, slice
mexican restaurant: mexican restaurant, tacos, burrito, taqueria
italian restaurant: italian restaurant, pasta, trattoria
chinese restaurant: chinese restaurant, chinese food, dim sum
japanese restaurant: sushi, ramen, japanese restaurant, hibachi
thai restaurant: thai restaurant, thai food, pad thai
indian restaurant: indian restaurant, indian cuisine, curry
barbecue restaurant: bbq, barbecue, smokehouse, brisket
hamburger restaurant: burger, burgers, hamburger
seafood restaurant: seafood, crab, oyster, lobster
steak house: steakhouse, steak house, steaks
breakfast restaurant: breakfast, brunch, pancake
bakery: bakery, cupcake, bread, pastry, pastries, cake shop, custom cakes
coffee shop: coffee shop, cafe, espresso, latte, coffee house, coffee roaster
ice cream shop: ice cream, gelato, frozen yogurt, creamery
bar: cocktail bar, sports bar, pub, tavern, taproom
brewery: brewery, craft beer, brewing company
winery: winery, vineyard, wine tasting
food truck: food truck
restaurant: restaurant, dining, menu, dine in, takeout, eatery, grill
grocery store: grocery, supermarket, market
butcher shop: butcher, meat market
liquor store: liquor store, wine and spirits
clothing store: clothing, apparel, boutique, fashion
jewelry store: jewelry, jeweler, engagement ring, diamond
furniture store: furniture store, furniture, mattress
hardware store: hardware store, hardware
home goods store: home decor, home goods, gifts
gift shop: gift shop, gifts, souvenirs
book store: bookstore, book store, books
pet supply store: pet supply, pet store, pet food
garden center: garden center, nursery, plants
florist supply: florist supply
bicycle shop: bike shop, bicycle, bike repair
sporting goods store: sporting goods, outdoor gear
toy store: toy store, toys
thrift store: thrift store, consignment, resale
vape shop: vape shop, vape
smoke shop: smoke shop, tobacco, cigar
cannabis store: dispensary, cannabis
pharmacy: pharmacy, pharmacist, prescription
auto repair shop: auto repair, car repair, mechanic, brake repair, oil change, engine repair, transmission
auto body shop: auto body, collision repair, dent repair, paintless dent
car detailing service: auto detailing, car detailing, ceramic coating, paint correction, window tint
tire shop: tire shop, tires, wheel alignment
car dealer: car dealer, used cars, new cars, dealership, pre owned
towing service: towing, tow truck, roadside assistance
car wash: car wash
motorcycle dealer: motorcycle
rv dealer: rv dealer, camper, rv sales
boat dealer: boat dealer, boats for sale, marina
hotel: hotel, motel, inn, lodging, rooms and suites
bed & breakfast: bed and breakfast, b&b
vacation home rental agency: vacation rental, cabin rental, short term rental
travel agency: travel agency, travel agent, vacation package
church: church, worship, ministry, sermon
non-profit organization: nonprofit, non profit, charity, donate, foundation
printing shop: printing, print shop, screen printing, embroidery, signage
sign shop: sign shop, signs, banners, vehicle wrap
trucking company: trucking, freight, logistics, shipping
courier service: courier, delivery service
staffing agency: staffing agency, recruiting, staffing
manufacturer: manufacturing, manufacturer, fabrication, machining
welder: welding, welder, metal fabrication
steel construction company: steel building, metal building, pole barn, post frame
shed builder: shed, sheds, storage building
funeral home: funeral home, cremation, funeral service
`;

export const CATEGORIES = TABLE.trim().split("\n").map((line) => {
  const i = line.indexOf(":");
  return { name: line.slice(0, i).trim(), triggers: line.slice(i + 1).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) };
});

/** Every word used in a category phrase ("plumbing", "conditioning", "roof"). */
export const TRADE_WORDS = new Set(CATEGORIES.flatMap((c) => [c.name, ...c.triggers]).flatMap((s) => s.split(/[^a-z0-9]+/)).filter((w) => w.length > 2));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+");
const RX = new Map(CATEGORIES.flatMap((c) => c.triggers).map((t) => [t, new RegExp(`(^|[^a-z0-9])${esc(t)}(s|es)?(?=$|[^a-z0-9])`, "g")]));
const flat = (s) => " " + String(s || "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/\s+/g, " ") + " ";
/** How many times a trigger phrase appears in text. */
export const countOf = (text, trigger) => (flat(text).match(RX.get(trigger)) || []).length;

/**
 * What a business does, from the places its website says it: fields is [{ text, weight }] (title, description,
 * headings, menu, schema), or [{ text, perMention }] for page text, which counts by how often. Each category scores the weight of every field naming one of its phrases, plus a little
 * for how often its phrases appear. Returns the best { name, score, hits } or null when nothing names a trade.
 */
export function bestCategory(fields, { min = 3 } = {}) {
  let best = null;
  CATEGORIES.forEach((c, order) => {
    let score = 0;
    const hits = new Set();
    for (const f of fields) {
      let distinct = 0, total = 0;
      for (const t of c.triggers) {
        const n = countOf(f.text, t);
        if (n) { hits.add(t); distinct++; total += n; }
      }
      if (!distinct) continue;
      // Page text counts by how often (up to 6 mentions); other fields once, a little more when they name several phrases.
      score += f.perMention ? f.perMention * Math.min(total, 6) : f.weight * (1 + 0.25 * Math.min(distinct - 1, 2));
    }
    // Earlier (more specific) categories win ties.
    score -= order * 1e-4;
    if (score >= min && (!best || score > best.score)) best = { name: c.name, score, hits: [...hits] };
  });
  return best;
}

/** Does a phrase name something a business sells (any category's phrase, or a service word)? */
const SERVICE_WORD = /\b(repair|repairs|replacement|installation|installer|install|cleaning|removal|inspection|design|maintenance|service|services|remodel|remodeling|renovation|restoration|treatment|therapy|lessons?|classes|training|rental|delivery|catering|consultation|care|cleanup|upgrade|detailing|coating|painting|washing|pumping|grooming|boarding|planning|preparation|coaching)\b/i;
export const soundsLikeService = (phrase) => SERVICE_WORD.test(phrase) || [...RX.values()].some((rx) => { rx.lastIndex = 0; return rx.test(flat(phrase)); });
