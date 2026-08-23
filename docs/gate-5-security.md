# Gate 5 collaboration security

All Gate 5 access derives from active Trip Membership. The public tables use RLS for member reads, self-only collaboration writes, and Owner/Planner Decision management.

Traveller may react, set their own participation, and respond to Decisions. Traveller cannot structurally edit destinations, plan items, Ideas, or trip metadata. Viewer remains read-only. Removed members and outsiders lose access through the active-membership predicates.

`create_trip_decision` and `resolve_trip_decision` intentionally remain authenticated `security definer` RPCs because each operation is transactional across related rows. Both revoke access from `PUBLIC` and `anon`, require `auth.uid()`, verify active Owner/Planner membership internally, use an empty `search_path`, validate object ownership, and never apply itinerary changes.

The existing authenticated trip/invitation RPCs remain for the same bounded transactional reason. Their explicit authentication, role, token, membership and ownership checks continue to be covered by the Gate 1–5 pgTAP suite.
