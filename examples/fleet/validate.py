#!/usr/bin/env python3
"""Trusted local attestations, not live effects or provider backend identity.

The caller supplies protected project policy, an independently retained intent
digest and independently observed head/base. No payload execution, network,
state writes, reviewer launches or resource removal occur here.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re

MAX_INPUT_BYTES = 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def object_value(value, name):
    require(isinstance(value, dict), name + ' must be an object')
    return value


def text(value, name):
    require(isinstance(value, str) and bool(value.strip()) and len(value) <= 512,
            name + ' must be nonempty bounded text')
    return value


def context_identity(value, name):
    text(value, name)
    require(re.fullmatch(r'[a-z0-9._:/-]{1,512}', value),
            name + ' must be a bounded lowercase ASCII machine identifier')
    return value


def integer(value, name, minimum=0):
    require(type(value) is int and value >= minimum, name + ' must be an integer')
    return value


def digest(value, name, length=64):
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{' + str(length) + '}', value),
            name + ' must be a full lowercase digest')
    return value


def names(value, name):
    require(isinstance(value, list) and 0 < len(value) <= 200, name + ' must be a nonempty list')
    for item in value:
        text(item, name)
    require(len(set(value)) == len(value), name + ' contains duplicates')
    return value


def path_value(value):
    text(value, 'scope path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and '..' not in path.parts and '\\' not in value
            and '\0' not in value and value not in ('.', '')
            and path.as_posix() == value, 'invalid relative scope path')
    return value


def timestamp(value):
    require(isinstance(value, str) and re.fullmatch(
        r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)', value),
        'timestamps must be explicit UTC ISO 8601')
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValueError('invalid timestamp') from exc


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'duplicate JSON key: ' + key)
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('non-finite JSON number: ' + value)


def finite_float(value):
    number = float(value)
    require(math.isfinite(number), 'non-finite JSON number: ' + value)
    return number


def parse(raw):
    require(isinstance(raw, bytes) and 0 < len(raw) <= MAX_INPUT_BYTES, 'input byte limit exceeded')
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=unique_keys,
                          parse_constant=reject_constant, parse_float=finite_float)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('invalid UTF-8 JSON') from exc


def bound_identity(value, intent, fields):
    object_value(value, 'evidence entry')
    for field in fields:
        require(value.get(field) == intent[field], 'different ' + field)


def report_line(report, label, expected):
    matches = re.findall('^' + re.escape(label) + r': (.*)$', report, re.M)
    require(matches == [expected], 'original report lacks unique exact ' + label)


def validate_reviews(project, intent, evidence):
    changed = names(evidence.get('changed_paths'), 'changed_paths')
    allowed = set(names(intent.get('allowed_paths'), 'allowed_paths'))
    for path in [*changed, *allowed]:
        path_value(path)
    require(set(changed) <= allowed, 'change escaped immutable scope')
    prefixes = names(project.get('sensitive_paths'), 'sensitive_paths')
    for prefix in prefixes:
        path_value(prefix.rstrip('/'))
    risk = intent.get('risk')
    require(risk in ('routine', 'sensitive'), 'unknown risk classification')
    sensitive = any(path.startswith(prefix) for path in changed for prefix in prefixes)
    require(not sensitive or risk == 'sensitive', 'sensitive path mislabeled routine')
    authors = {context_identity(context, 'implementation context') for context in
               names(intent.get('implementation_contexts'), 'implementation_contexts')}
    authors.add(context_identity(intent.get('coordinator_context'), 'coordinator_context'))
    reviews = evidence.get('reviews')
    require(isinstance(reviews, list) and 1 <= len(reviews) <= 200, 'missing reviews')
    required = 2 if risk == 'sensitive' else 1
    require(len(reviews) >= required, f'{required} independent contexts required')
    contexts = set(authors)
    report_hashes = set()
    for review in reviews:
        object_value(review, 'review')
        context = context_identity(review.get('context'), 'review context')
        require(context not in contexts, 'review context is not independent')
        contexts.add(context)
        text(review.get('provider'), 'provider')
        require('configured_model' in review and 'observed_model' in review,
                'separate configured/observed model metadata required; null means unavailable')
        for field in ('configured_model', 'observed_model'):
            if review[field] is not None:
                text(review[field], field)
        require(review.get('verdict') == 'SHIP', 'review is not SHIP')
        report = review.get('report')
        require(isinstance(report, str) and 0 < len(report.encode('utf-8')) <= 24000,
                'missing or oversized original report')
        report_hash = hashlib.sha256(report.encode('utf-8')).hexdigest()
        require(report_hash == digest(review.get('report_sha256'), 'report_sha256'),
                'original report was altered')
        require(report_hash not in report_hashes, 'copied original review report')
        report_hashes.add(report_hash)
        for label, expected in (('HEAD_SHA', intent['head_sha']), ('BASE_SHA', intent['base_sha']),
                                ('VERDICT', 'SHIP'), ('RULES_FAILED', 'NONE'), ('GATES', 'PASS')):
            report_line(report, label, expected)
        inspection = report.replace('**', '').replace('`', '')
        require(not re.search(r'^VERDICT:\s*BLOCK\b|^GATES:\s*(?:FAIL|MISSING)\b', inspection, re.M),
                'original report contains a contradictory blocking line')
    required_gates = names(project.get('required_gates'), 'required_gates')
    gates = evidence.get('gates')
    require(isinstance(gates, list), 'missing gates')
    observed = []
    for gate in gates:
        bound_identity(gate, intent, ('head_sha', 'base_sha'))
        observed.append(text(gate.get('name'), 'gate name'))
        require(gate.get('status') == 'PASS', 'gate did not pass')
        integer(gate.get('executed'), 'gate executed count', 1)
        require(type(gate.get('skipped')) is int and gate['skipped'] == 0, 'gate skipped checks')
        digest(gate.get('receipt_sha256'), 'gate receipt')
    require(len(observed) == len(set(observed)) and set(required_gates) <= set(observed),
            'missing or duplicate required gate')


def validate_completion(project, intent, evidence, start, cutoff, limits):
    completion = object_value(evidence.get('completion'), 'completion')
    require(completion.get('status') == 'complete', 'completion is not known complete')
    finish = timestamp(completion.get('finished_at'))
    require(start <= finish <= cutoff and finish <= datetime.now(timezone.utc),
            'completion outside finite window or in future')
    attempts = completion.get('attempts')
    require(isinstance(attempts, list) and 0 < len(attempts) <= limits['max_attempts'],
            'missing attempts or attempt budget exceeded')
    roles, output_bytes = [], 0
    for ordinal, attempt in enumerate(attempts, 1):
        object_value(attempt, 'attempt')
        require(type(attempt.get('ordinal')) is int and attempt['ordinal'] == ordinal,
                'charges must remain contiguous and unique')
        role = attempt.get('role')
        require(role in ('work', 'verification'), 'unknown attempt role')
        roles.append(role)
        charged, launched, ended = (timestamp(attempt.get(field))
            for field in ('charged_at', 'started_at', 'finished_at'))
        require(start <= charged <= launched <= ended <= finish, 'charge/launch/terminal window invalid')
        status, code = attempt.get('status'), attempt.get('exit_code')
        require(status in ('success', 'failed') and type(code) is int and code >= 0
                and ((status == 'success') == (code == 0)), 'unknown or contradictory attempt outcome')
        process = object_value(attempt.get('process'), 'process custody')
        integer(process.get('pid'), 'pid', 1)
        integer(process.get('pgid'), 'pgid', 1)
        text(process.get('birth'), 'process birth')
        require(process.get('group_closed') is True, 'owned process group closure unknown')
        digest(attempt.get('receipt_sha256'), 'attempt receipt')
        output_bytes += integer(attempt.get('output_bytes'), 'output_bytes')
    reserve = limits['verification_reserve']
    require(roles.count('work') <= limits['max_attempts'] - reserve
            and roles.count('verification') >= reserve, 'verification reserve consumed or unfulfilled')
    require(output_bytes <= limits['max_output_bytes'], 'cumulative output budget exceeded')
    peak = integer(completion.get('peak_resources'), 'peak_resources')
    disk = integer(completion.get('peak_disk_bytes'), 'peak_disk_bytes')
    require(peak <= limits['max_resources'] and disk <= limits['max_disk_bytes'], 'resource ceiling exceeded')
    resources = completion.get('resources')
    require(isinstance(resources, list) and len(resources) <= peak, 'resource inventory missing or understated')
    owners = {*intent['implementation_contexts'], intent['coordinator_context']}
    for resource in resources:
        object_value(resource, 'resource')
        owner = context_identity(resource.get('owner_context'), 'resource owner')
        owned = resource.get('owned')
        require(type(owned) is bool and owned == (owner in owners), 'ownership contradicts task custody')
        digest(resource.get('receipt_sha256'), 'resource receipt')
        if owned:
            require(resource.get('disposition') == 'closed'
                    and resource.get('preservation') == 'commits-uncommitted-ignored', 'owned cleanup incomplete')
        else:
            require(resource.get('disposition') == 'preserved', 'foreign resource modified')
    effects = completion.get('effects')
    require(isinstance(effects, list), 'missing effect receipts')
    observed = []
    for effect in effects:
        bound_identity(effect, intent, ('project_id', 'repository', 'task_id', 'head_sha'))
        name = text(effect.get('name'), 'effect name')
        require(name in intent['authorization']['effects'], 'observed effect lacks authorization')
        observed.append(name)
        require(effect.get('status') == 'confirmed', 'effect failed or unknown')
        digest(effect.get('receipt_sha256'), 'effect receipt')
        if name == 'notice':
            require(effect.get('received') is True, 'completion notice not received')
    required = names(project.get('required_effects'), 'required_effects')
    require({'ci', 'merge', 'work_item', 'cleanup'} <= set(required),
            'complete mode requires baseline delivery, work-item and cleanup evidence')
    require(len(observed) == len(set(observed)) and set(required) <= set(observed), 'missing or duplicate effect')


def validate(project, intent_bytes, evidence, *, head, base, intent_sha256, mode='review'):
    object_value(project, 'project')
    object_value(evidence, 'evidence')
    intent = object_value(parse(intent_bytes), 'intent')
    require(mode in ('review', 'complete'), 'unsupported validation mode')
    for item in (project, intent, evidence):
        require(type(item.get('schema_version')) is int and item['schema_version'] == 1, 'unsupported schema')
    for field in ('project_id', 'repository', 'base_branch'):
        text(project.get(field), field)
        require(intent.get(field) == project[field], 'different ' + field)
    text(intent.get('task_id'), 'task_id')
    bound_identity(evidence, intent, ('project_id', 'repository', 'task_id', 'head_sha', 'base_sha'))
    require(digest(head, 'head', 40) == intent['head_sha']
            and digest(base, 'base', 40) == intent['base_sha'], 'stale head or base')
    require(hashlib.sha256(intent_bytes).hexdigest() == digest(intent_sha256, 'protected intent digest')
            == evidence.get('intent_sha256'), 'immutable intent bytes changed')
    authorization = object_value(intent.get('authorization'), 'authorization')
    text(authorization.get('actor'), 'authorizing actor')
    digest(authorization.get('receipt_sha256'), 'authorization receipt')
    authorized = names(authorization.get('effects'), 'authorized effects')
    require({'source-change', 'review', *names(project.get('required_effects'), 'required_effects')}
            <= set(authorized), 'declared effects lack authorization')
    start, cutoff = timestamp(intent.get('started_at')), timestamp(intent.get('cutoff_at'))
    limits = object_value(intent.get('limits'), 'limits')
    for field in ('max_attempts', 'verification_reserve', 'max_seconds', 'max_output_bytes',
                  'max_resources', 'max_disk_bytes'):
        integer(limits.get(field), field, 1)
    require(limits['verification_reserve'] < limits['max_attempts'], 'no work capacity outside reserve')
    require(0 < (cutoff - start).total_seconds() <= limits['max_seconds'], 'invalid finite deadline')
    validate_reviews(project, intent, evidence)
    if mode == 'complete':
        validate_completion(project, intent, evidence, start, cutoff, limits)
    return ('COMPLETE' if mode == 'complete' else 'REVIEW') + ': local contract satisfied'


def read_bytes(path):
    with Path(path).open('rb') as stream:
        return stream.read(MAX_INPUT_BYTES + 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='protected project policy JSON')
    parser.add_argument('--intent', required=True, help='original immutable intent JSON')
    parser.add_argument('--evidence', required=True, help='local evidence record JSON')
    parser.add_argument('--intent-sha256', required=True, help='digest from protected original custody')
    parser.add_argument('--head', required=True, help='independently observed current head')
    parser.add_argument('--base', required=True, help='independently observed diff base')
    parser.add_argument('--mode', choices=['review', 'complete'], default='review')
    args = parser.parse_args()
    try:
        print(validate(parse(read_bytes(args.project)), read_bytes(args.intent), parse(read_bytes(args.evidence)),
                       head=args.head, base=args.base, intent_sha256=args.intent_sha256, mode=args.mode))
    except (OSError, ValueError, KeyError, TypeError, RecursionError) as exc:
        parser.exit(1, 'CONTRACT: BLOCK: ' + str(exc) + '\n')


if __name__ == '__main__':
    main()
