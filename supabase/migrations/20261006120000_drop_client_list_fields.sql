-- The client_list view computes these in one pass, and nothing else read them.
-- current_employee_count stays: a single client's read and the documents use it.
drop function public.job_position_count(public.clients);
drop function public.job_positions_needing_work_count(public.clients);
drop function public.documentation_generated_type_keys(public.clients);
drop function public.documentation_issued_count(public.clients);
drop function public.documentation_last_generated_at(public.clients);
drop function public.client_since(public.clients);
