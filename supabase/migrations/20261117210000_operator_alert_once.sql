-- An invoicing alert to the operator is claimed by its row before it is posted to Discord (ADR 029,
-- amendment "invoicing problems reach the operator"): two deliveries of the same problem at once,
-- such as a subscription's .deleted and .updated events, must not both post. The claim is removed
-- when Discord does not take the post, so a later delivery tries again.
create unique index subscription_changes_operator_alert_once
  on public.subscription_changes ((details ->> 'alert_key'))
  where change = 'operator_alerted';
