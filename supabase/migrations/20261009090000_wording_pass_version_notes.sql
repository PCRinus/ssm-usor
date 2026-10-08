-- The citation wording pass (#347) changed these files, but their manifest notes still described
-- the content pass before it, so the versions registered from them carry the wrong note.
update public.document_template_versions
set note = 'Actele normative citate, scrise uniform („Legea 319/2006”, „H.G. 1425/2006”), cu un singur separator înaintea articolului; titlurile de capitol din marcajele „Preluare din” au fost scoase.'
where sha256 in (
  'b3f8d0e1aa20181ba93e08ab0b222dcbde0ae0dc910375b5b59863ccfce7f8fa', -- 1.1_decision_training.docx
  '6c77c9ee010c5ebc358493c6d7578220a7127ebf734dda694da7cf8486e373e4', -- 1.2_decision_risk_evaluation_team.docx
  'ac9f6c8dc35b855a4fbcc65ee560ca9694d68c6d3aa0f72a1905c10937dd2f25', -- 1.3_decision_first_aid.docx
  'c2c19cccacabf49963b649a26a15eda3d468fa3e6f22a4f614c3bcb273da70b1', -- 1.4_decision_imminent_danger.docx
  'b82bedaaf04e9a6c5b80db8027ce79389646331edf29215dc1ba81844e036bd9', -- 1.5_decision_workers_representative.docx
  'c3308a31cf65a793ffb698f450816e9b40dc2f9c1494bf9920e04705fe42bb82', -- 11_employer_briefing.docx
  '02c230d2e9c4f360840c96b93f1780074d44ded77b1bfaec8435778d4962cd08', -- 12_control_regulation.docx
  'cf9399cc718174a9565cde9a4582b770c1a5c14a99255c136a673a3871233bf4', -- 2.2_general_training_material.docx
  '616fcf77d6548346566d97e81cecdb1084f75be447d883fa31aa566fbac3510f', -- 3.2_own_instructions.docx
  'd76aac3a6f4a27c57f1cd2914daf7a1502cd838da914f814fa064ce40a38f831', -- 4.2_training_themes.docx
  '8f6df3e77dcde3e23bb1aa93475b0e4da2e85ae11e3d6411e55d030438420fa1', -- 5.1_test_hiring.docx
  '219cc6be080f1bf91053bbbc06b97eff5875f939498bf33c539a22d70f21ff5a', -- 6_protective_equipment_list.docx
  '46209d9539075c75f96854c7b8ae02b0700f706ce4cdf39ea2bb5e345a098797', -- 9_risk_assessment.docx
  '9d0343e095b859ae1056f06da58f7d7b48f8599a9b6709f07673239dbdfadb66' -- other/service_contract.docx
);
