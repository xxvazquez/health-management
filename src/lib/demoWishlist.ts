import type { WishlistCategory } from "@/lib/supabase/wishlist";
import { DEMO_HOME_ME_ID, DEMO_HOME_PARTNER_ID } from "@/lib/demoHousehold";

/** Example wishlist for the Household page when signed out — interactive,
 * in-memory only, nothing saved. Same idea as demoHousehold.ts. */
const DAY = 24 * 60 * 60 * 1000;
const iso = (msOffset: number) => new Date(Date.now() + msOffset).toISOString();

export function buildDemoWishlist(): WishlistCategory[] {
  return [
    {
      id: "demo-wl-cat-home",
      name: "Home",
      createdAt: iso(-30 * DAY),
      items: [
        {
          id: "demo-wl-1",
          categoryId: "demo-wl-cat-home",
          url: "https://www.example.com/floating-oak-shelf",
          title: "Floating oak shelf, 80 cm",
          note: "For the hallway — measure first, the gap is about 85 cm.",
          forUserId: null,
          createdAt: iso(-3 * DAY),
        },
        {
          id: "demo-wl-2",
          categoryId: "demo-wl-cat-home",
          url: "https://www.example.com/warm-bedside-lamp",
          title: "Warm-white bedside lamp",
          note: null,
          forUserId: DEMO_HOME_ME_ID,
          createdAt: iso(-11 * DAY),
        },
      ],
    },
    {
      id: "demo-wl-cat-gifts",
      name: "Gift ideas",
      createdAt: iso(-18 * DAY),
      items: [
        {
          id: "demo-wl-3",
          categoryId: "demo-wl-cat-gifts",
          url: "https://www.example.com/seasonal-veg-cookbook",
          title: "The seasonal veg cookbook",
          note: "For Mum's birthday in March.",
          forUserId: DEMO_HOME_PARTNER_ID,
          createdAt: iso(-1 * DAY),
        },
      ],
    },
    {
      id: "demo-wl-cat-trips",
      name: "Trips",
      createdAt: iso(-6 * DAY),
      items: [],
    },
  ];
}
