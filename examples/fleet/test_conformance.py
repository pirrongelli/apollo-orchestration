"""Synthetic local contract checks; never live delivery or provider evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
MODULE = ROOT / 'validate.py'
if MODULE.exists():
    spec = importlib.util.spec_from_file_location('apollo_validate', MODULE)
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
else:
    validator = None


class Conformance(unittest.TestCase):
    def setUp(self):
        directory = ROOT / 'fixtures' / 'cedar'
        self.project = json.loads((directory / 'project.json').read_text())
        self.raw = (directory / 'intent.json').read_bytes()
        self.intent = json.loads(self.raw)
        self.evidence = json.loads((directory / 'evidence.json').read_text())

    def run_contract(self, mode='complete', **kwargs):
        self.assertIsNotNone(validator, 'portable contract validator is missing')
        return validator.validate(self.project, self.raw, self.evidence,
            head=kwargs.get('head', self.intent['head_sha']),
            base=kwargs.get('base', self.intent['base_sha']),
            intent_sha256=kwargs.get('anchor', hashlib.sha256(self.raw).hexdigest()), mode=mode)

    def changed_intent(self):
        self.raw = (json.dumps(self.intent, indent=2) + '\n').encode()
        self.evidence['intent_sha256'] = hashlib.sha256(self.raw).hexdigest()

    def refused(self, mode='complete', **kwargs):
        with self.assertRaises(ValueError):
            self.run_contract(mode, **kwargs)

    def report(self, index, old, new):
        review = self.evidence['reviews'][index]
        review['report'] = review['report'].replace(old, new)
        review['report_sha256'] = hashlib.sha256(review['report'].encode()).hexdigest()

    def test_two_distinct_projects_conform_locally(self):
        for name in ('cedar', 'harbor'):
            with self.subTest(project=name):
                directory = ROOT / 'fixtures' / name
                self.project = json.loads((directory / 'project.json').read_text())
                self.raw = (directory / 'intent.json').read_bytes()
                self.intent = json.loads(self.raw)
                self.evidence = json.loads((directory / 'evidence.json').read_text())
                self.assertEqual(len({review['report_sha256'] for review in self.evidence['reviews']}), 2)
                self.assertEqual(len({review['report'] for review in self.evidence['reviews']}), 2)
                self.assertEqual(self.run_contract(), 'COMPLETE: local contract satisfied')

    def test_review_does_not_claim_completion(self):
        del self.evidence['completion']
        self.assertEqual(self.run_contract('review'), 'REVIEW: local contract satisfied')

    def test_every_observed_effect_requires_authorization(self):
        effect = dict(self.evidence['completion']['effects'][0], name='production-delete')
        self.evidence['completion']['effects'].append(effect)
        self.refused()

    def test_explicitly_authorized_additional_effect(self):
        self.intent['authorization']['effects'].append('additional-delivery')
        self.changed_intent()
        effect = dict(self.evidence['completion']['effects'][0], name='additional-delivery')
        self.evidence['completion']['effects'].append(effect)
        self.assertEqual(self.run_contract(), 'COMPLETE: local contract satisfied')

    def test_json_numeric_overflow_is_refused(self):
        for number in (b'1e9999', b'-1e9999'):
            with self.subTest(number=number), self.assertRaises(ValueError):
                validator.parse(b'{"observation":' + number + b'}')

    def test_finite_json_floats_remain_valid(self):
        self.assertEqual(validator.parse(b'{"observations":[1.5,-2e3,1e-3]}'),
                         {'observations': [1.5, -2000.0, 0.001]})

    def test_nul_scope_path_is_refused(self):
        path = 'policy/invalid\0.py'
        self.intent['allowed_paths'] = [path]
        self.evidence['changed_paths'] = [path]
        self.changed_intent()
        self.refused()

    def test_legitimate_scope_filename_characters_remain_valid(self):
        path = "policy/space 'quote' $value; café.py"
        self.intent['allowed_paths'] = [path]
        self.evidence['changed_paths'] = [path]
        self.changed_intent()
        self.assertEqual(self.run_contract(), 'COMPLETE: local contract satisfied')

    def test_stale_head(self): self.refused(head='9' * 40)
    def test_stale_base(self): self.refused(base='9' * 40)
    def test_changed_project(self):
        self.project['project_id'] = 'other'; self.refused()
    def test_changed_repository(self):
        self.project['repository'] = 'sample/other'; self.refused()
    def test_changed_base_branch(self):
        self.project['base_branch'] = 'other'; self.refused()
    def test_changed_intent_anchor(self): self.refused(anchor='9' * 64)
    def test_changed_intent_bytes(self):
        self.raw += b' '; self.refused()
    def test_scope_escape(self):
        self.evidence['changed_paths'] = ['outside.py']; self.refused()
    def test_parent_path(self):
        self.intent['allowed_paths'] = ['../secret']; self.changed_intent(); self.refused()
    def test_sensitive_cannot_claim_routine(self):
        self.intent['risk'] = 'routine'; self.changed_intent(); self.refused()
    def test_missing_reviewer(self):
        self.evidence['reviews'].pop(); self.refused()
    def test_self_review(self):
        self.evidence['reviews'][0]['context'] = self.intent['implementation_contexts'][0]; self.refused()
    def test_coordinator_cannot_review(self):
        self.evidence['reviews'][0]['context'] = self.intent['coordinator_context']; self.refused()
    def test_duplicate_review_context(self):
        self.evidence['reviews'][1]['context'] = self.evidence['reviews'][0]['context']; self.refused()
    def test_copied_original_reports_from_distinct_contexts_are_refused(self):
        first, second = self.evidence['reviews']
        second['report'] = first['report']
        second['report_sha256'] = first['report_sha256']
        self.refused('review')
    def test_reviewer_context_aliases_of_authors_are_refused(self):
        for context in (*self.intent['implementation_contexts'], self.intent['coordinator_context']):
            for alias in (' ' + context, context + ' ', context + '\t', context.upper()):
                with self.subTest(alias=alias):
                    self.evidence['reviews'][0]['context'] = alias
                    self.refused('review')
    def test_aliases_cannot_count_as_distinct_reviewer_contexts(self):
        context = self.evidence['reviews'][0]['context']
        for alias in (' ' + context, context + ' ', context + '\t', context.upper()):
            with self.subTest(alias=alias):
                self.evidence['reviews'][1]['context'] = alias
                self.refused('review')
    def test_noncanonical_author_inventory_cannot_hide_self_review(self):
        for field in ('implementation_contexts', 'coordinator_context'):
            context = self.intent[field][0] if field == 'implementation_contexts' else self.intent[field]
            for alias in (' ' + context, context + ' ', context.upper()):
                with self.subTest(field=field, alias=alias):
                    self.evidence['reviews'][0]['context'] = context
                    if field == 'implementation_contexts':
                        self.intent[field][0] = alias
                    else:
                        self.intent[field] = alias
                    self.changed_intent()
                    self.refused('review')
            if field == 'implementation_contexts':
                self.intent[field][0] = context
            else:
                self.intent[field] = context
    def test_canonical_distinct_contexts_preserve_original_metadata(self):
        original = json.dumps(self.evidence, sort_keys=True)
        self.assertEqual(self.run_contract('review'), 'REVIEW: local contract satisfied')
        self.assertEqual(json.dumps(self.evidence, sort_keys=True), original)
    def test_block_report_even_if_declared_ship(self):
        self.report(0, 'VERDICT: SHIP', 'VERDICT: BLOCK'); self.refused()
    def test_report_foreign_base(self):
        self.report(0, self.intent['base_sha'], '9' * 40); self.refused()
    def test_report_tamper(self):
        self.evidence['reviews'][0]['report'] += 'changed'; self.refused()
    def test_report_conflicting_verdict(self):
        self.report(0, 'VERDICT: SHIP', 'VERDICT: SHIP\nVERDICT: BLOCK'); self.refused()
    def test_report_trailing_verdict_text(self):
        self.report(0, 'VERDICT: SHIP', 'VERDICT: SHIP for source'); self.refused()
    def test_bold_block_cannot_hide_after_plain_ship(self):
        self.report(0, 'VERDICT: SHIP', 'VERDICT: SHIP\n**VERDICT: BLOCK**'); self.refused()
    def test_routine_scope_needs_one_independent_review(self):
        self.intent['allowed_paths'] = ['README.md']; self.intent['risk'] = 'routine'
        self.changed_intent(); self.evidence['changed_paths'] = ['README.md']
        self.evidence['reviews'] = self.evidence['reviews'][:1]
        self.assertEqual(self.run_contract('review'), 'REVIEW: local contract satisfied')
    def test_missing_gate(self):
        self.evidence['gates'].pop(); self.refused()
    def test_failed_gate(self):
        self.evidence['gates'][0]['status'] = 'FAIL'; self.refused()
    def test_zero_executed_gate(self):
        self.evidence['gates'][0]['executed'] = 0; self.refused()
    def test_skipped_gate(self):
        self.evidence['gates'][0]['skipped'] = 1; self.refused()
    def test_stale_gate(self):
        self.evidence['gates'][0]['head_sha'] = '9' * 40; self.refused()
    def test_missing_completion(self):
        del self.evidence['completion']; self.refused()
    def test_unknown_effect(self):
        self.evidence['completion']['effects'][0]['status'] = 'unknown'; self.refused()
    def test_complete_cannot_omit_baseline_delivery_effects(self):
        self.project['required_effects'] = ['notice']; self.refused()
    def test_failed_effect(self):
        self.evidence['completion']['effects'][0]['status'] = 'failed'; self.refused()
    def test_foreign_effect(self):
        self.evidence['completion']['effects'][0]['repository'] = 'sample/other'; self.refused()
    def test_notice_sent_is_not_received(self):
        self.evidence['completion']['effects'][-1]['received'] = False; self.refused()
    def test_missing_cleanup(self):
        self.evidence['completion']['resources'][0]['disposition'] = 'active'; self.refused()
    def test_foreign_resource_closed(self):
        self.evidence['completion']['resources'][1]['disposition'] = 'closed'; self.refused()
    def test_lost_ignored_evidence(self):
        self.evidence['completion']['resources'][0]['preservation'] = 'commits-only'; self.refused()
    def test_resource_owner_aliases_cannot_bypass_owned_cleanup(self):
        for project in ('cedar', 'harbor'):
            directory = ROOT / 'fixtures' / project
            self.project = json.loads((directory / 'project.json').read_text())
            self.raw = (directory / 'intent.json').read_bytes()
            self.intent = json.loads(self.raw)
            self.evidence = json.loads((directory / 'evidence.json').read_text())
            for owner in (*self.intent['implementation_contexts'], self.intent['coordinator_context']):
                for alias in (owner.upper(), ' ' + owner, owner + ' '):
                    with self.subTest(project=project, alias=alias):
                        resource = self.evidence['completion']['resources'][0]
                        resource.update(owner_context=alias, owned=False, disposition='preserved')
                        resource.pop('preservation', None)
                        self.refused()
    def test_owned_resource_keeps_boolean_and_preservation_guards(self):
        original = dict(self.evidence['completion']['resources'][0])
        for changes in ({'owned': 0}, {'owned': 'false'},
                        {'owned': False, 'disposition': 'preserved'},
                        {'disposition': 'active'}, {'preservation': 'commits-only'}):
            with self.subTest(changes=changes):
                self.evidence['completion']['resources'][0] = {**original, **changes}
                self.refused()
    def test_machine_identifiers_refuse_non_ascii_aliases_in_every_role(self):
        for project in ('cedar', 'harbor'):
            directory = ROOT / 'fixtures' / project
            for role in ('implementation', 'coordinator', 'reviewer', 'resource'):
                baseline = json.loads((directory / 'intent.json').read_text())
                context = (baseline['coordinator_context'] if role == 'coordinator'
                           else baseline['implementation_contexts'][0])
                aliases = [context + suffix for suffix in
                           ('\u200b', '\u200c', '\u200d', '\u2060', '\ufeff',
                            '\0', '\x1b', '\x7f', '\ninner', 'é', 'e\u0301')]
                aliases += [context.replace('-', '\u2010', 1),
                            context.replace('a', '\u0430', 1), context.replace('a', 'ａ', 1)]
                for alias in aliases:
                    with self.subTest(project=project, role=role, alias=alias):
                        self.project = json.loads((directory / 'project.json').read_text())
                        self.raw = (directory / 'intent.json').read_bytes()
                        self.intent = json.loads(self.raw)
                        self.evidence = json.loads((directory / 'evidence.json').read_text())
                        if role == 'implementation':
                            self.intent['implementation_contexts'][0] = alias
                            self.evidence['reviews'][0]['context'] = context
                            self.changed_intent()
                        elif role == 'coordinator':
                            self.intent['coordinator_context'] = alias
                            self.evidence['reviews'][0]['context'] = context
                            self.changed_intent()
                        elif role == 'reviewer':
                            self.evidence['reviews'][0]['context'] = alias
                        else:
                            resource = self.evidence['completion']['resources'][0]
                            resource.update(owner_context=alias, owned=False, disposition='preserved')
                            resource.pop('preservation', None)
                        self.refused('complete' if role == 'resource' else 'review')

    def test_ascii_machine_identifiers_admit_uuid_paths_and_token_punctuation(self):
        author = '01234567-89ab-cdef-0123-456789abcdef'
        self.intent['implementation_contexts'] = [author]
        self.intent['coordinator_context'] = '/root/coordinator'
        self.evidence['reviews'][0]['context'] = '/root/reviewer-1'
        self.evidence['reviews'][1]['context'] = 'reviewer.namespace:v1_2'
        self.evidence['completion']['resources'][0]['owner_context'] = author
        self.evidence['completion']['resources'][1]['owner_context'] = 'foreign.resource:v1_2'
        self.changed_intent()
        original = json.dumps(self.evidence, sort_keys=True)
        self.assertEqual(self.run_contract(), 'COMPLETE: local contract satisfied')
        self.assertEqual(json.dumps(self.evidence, sort_keys=True), original)
    def test_unknown_attempt(self):
        self.evidence['completion']['attempts'][0]['status'] = 'unknown'; self.refused()
    def test_duplicate_charge(self):
        self.evidence['completion']['attempts'][1]['ordinal'] = 1; self.refused()
    def test_work_consumes_verification_reserve(self):
        self.evidence['completion']['attempts'][1]['role'] = 'work'; self.refused()
    def test_missing_process_birth(self):
        del self.evidence['completion']['attempts'][0]['process']['birth']; self.refused()
    def test_charge_after_start(self):
        self.evidence['completion']['attempts'][0]['charged_at'] = '2026-01-01T00:00:03+00:00'; self.refused()
    def test_expired_terminal(self):
        self.evidence['completion']['finished_at'] = '2026-01-01T00:11:00+00:00'; self.refused()
    def test_over_attempt_budget(self):
        self.intent['limits']['max_attempts'] = 1; self.changed_intent(); self.refused()
    def test_over_output_budget(self):
        self.evidence['completion']['attempts'][0]['output_bytes'] = 64001; self.refused()
    def test_over_resource_budget(self):
        self.evidence['completion']['peak_resources'] = 3; self.refused()
    def test_over_disk_budget(self):
        self.evidence['completion']['peak_disk_bytes'] = 1000001; self.refused()
    def test_process_group_unresolved(self):
        self.evidence['completion']['attempts'][0]['process']['group_closed'] = False; self.refused()
    def test_failed_attempt_is_retained_with_nonzero_exit(self):
        self.assertEqual(self.run_contract(), 'COMPLETE: local contract satisfied')
        self.evidence['completion']['attempts'][0]['exit_code'] = 0; self.refused()
    def test_boolean_is_not_integer_budget(self):
        self.intent['limits']['max_attempts'] = True; self.changed_intent(); self.refused()
    def test_missing_authorization(self):
        del self.intent['authorization']; self.changed_intent(); self.refused()
    def test_duplicate_json_key(self):
        self.raw = self.raw.replace(b'"schema_version": 1', b'"schema_version": 1, "schema_version": 1')
        self.evidence['intent_sha256'] = hashlib.sha256(self.raw).hexdigest(); self.refused()

    def test_cli_positive_and_foreign_head_original_exit(self):
        directory = ROOT / 'fixtures' / 'harbor'
        intent = json.loads((directory / 'intent.json').read_text())
        args = ['python3', str(MODULE), '--project', str(directory / 'project.json'),
                '--intent', str(directory / 'intent.json'), '--evidence', str(directory / 'evidence.json'),
                '--intent-sha256', hashlib.sha256((directory / 'intent.json').read_bytes()).hexdigest(),
                '--head', intent['head_sha'], '--base', intent['base_sha'], '--mode', 'complete']
        result = subprocess.run(args, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'COMPLETE: local contract satisfied')
        args[args.index('--head') + 1] = '9' * 40
        result = subprocess.run(args, capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn('CONTRACT: BLOCK', result.stderr)

    def test_retired_writer_cannot_create_or_replace_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            before = list(directory.iterdir())
            result = subprocess.run(['bash', str(ROOT.parent / 'hooks' / 'record-approval.sh'), '1'],
                cwd=directory, capture_output=True, text=True, timeout=5)
            self.assertEqual(result.returncode, 2)
            self.assertIn('Retired', result.stderr)
            self.assertEqual(before, list(directory.iterdir()))

    def test_marker_cannot_unblock_legacy_hook(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            reviews = directory / '.claude' / 'reviews'; reviews.mkdir(parents=True)
            (reviews / self.intent['head_sha']).write_text('arbitrary marker')
            executable = directory / 'gh'
            executable.write_text('#!/bin/sh\nprintf \'%s\\n\' \'{"headRefOid":"' + self.intent['head_sha'] + '","baseRefName":"integration","headRefName":"feature/sample"}\'\n')
            executable.chmod(0o700)
            import os
            environment = {**os.environ, 'PATH': str(directory) + os.pathsep + os.environ['PATH']}
            result = subprocess.run(['bash', str(ROOT.parent / 'hooks' / 'merge-gate.sh')],
                input=json.dumps({'tool_input': {'command': 'gh pr merge 1 --squash'}}),
                cwd=directory, env=environment, text=True, capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 2)
            response = json.loads(result.stdout)
            self.assertEqual(response['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_retired_gate_denies_without_working_python(self):
        import os
        for interpreter in ('absent', 'failing'):
            with self.subTest(interpreter=interpreter), tempfile.TemporaryDirectory() as tmp:
                directory = Path(tmp)
                if interpreter == 'failing':
                    executable = directory / 'python3'
                    executable.write_text('#!/bin/sh\nexit 37\n')
                    executable.chmod(0o700)
                result = subprocess.run(['/bin/bash', str(ROOT.parent / 'hooks' / 'merge-gate.sh')],
                    env={**os.environ, 'PATH': str(directory)},
                    capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, 2, result.stderr)
                response = json.loads(result.stdout)
                self.assertEqual(response['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_retired_gate_fails_closed_when_output_cannot_be_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'read-only-descriptor'
            output.write_bytes(b'')
            with output.open('rb') as stream:
                result = subprocess.run(['/bin/bash', str(ROOT.parent / 'hooks' / 'merge-gate.sh')],
                    stdout=stream, stderr=subprocess.PIPE, text=True, timeout=5)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(output.read_bytes(), b'')

    def test_both_retired_hooks_refuse_closed_reader_pipes(self):
        import os
        for script, channel in (('merge-gate.sh', 'stdout'), ('record-approval.sh', 'stderr')):
            with self.subTest(script=script):
                reader, writer = os.pipe()
                os.close(reader)
                try:
                    streams = {'stdout': subprocess.PIPE, 'stderr': subprocess.PIPE, channel: writer}
                    result = subprocess.run(['/bin/bash', str(ROOT.parent / 'hooks' / script)],
                        restore_signals=True, timeout=5, **streams)
                    self.assertEqual(result.returncode, 2)
                finally:
                    os.close(writer)

    def test_both_retired_hooks_refuse_with_exit_function_shadow(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            environment = Path(tmp) / 'owned-bash-env'
            environment.write_text('exit() { return 0; }\n')
            for script in ('merge-gate.sh', 'record-approval.sh'):
                with self.subTest(script=script):
                    result = subprocess.run(['/bin/bash', str(ROOT.parent / 'hooks' / script)],
                        env={**os.environ, 'BASH_ENV': str(environment)},
                        capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, 2)
                    if script == 'merge-gate.sh':
                        self.assertEqual(json.loads(result.stdout)['hookSpecificOutput']['permissionDecision'], 'deny')
                    else:
                        self.assertIn('Retired', result.stderr)


if __name__ == '__main__':
    unittest.main()
