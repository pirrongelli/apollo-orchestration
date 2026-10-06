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
            self.assertEqual(result.returncode, 0)
            response = json.loads(result.stdout)
            self.assertEqual(response['hookSpecificOutput']['permissionDecision'], 'deny')


if __name__ == '__main__':
    unittest.main()
