"""Verify vote races and the lock-wait deadline on a disposable local database."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
from threading import Barrier
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    container = parser.parse_args().container
    if container != "supabase_db_diggin-96":
        raise SystemExit("Use the disposable diggin-96 test database.")
    command = ["docker", "exec", container, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"]

    def sql(statement):
        return subprocess.check_output(command + ["-c", statement], text=True, encoding="utf-8").strip()

    def vote(user, post, choice):
        return f"set local role authenticated; set local request.jwt.claims='{{\"sub\":\"{user}\",\"role\":\"authenticated\"}}'; select public.set_community_vote({post},'{choice}');"

    users = [str(uuid4()) for _ in range(5)]
    ids = ",".join(f"'{user}'::uuid" for user in users)
    sql("insert into auth.users(id,email) values " + ",".join(f"('{user}','{user}@vote-race.test')" for user in users))
    try:
        post = sql(f"insert into private.posts(author_id,type,content,ends_at) values ('{users[0]}','vote','동시 투표 테스트 게시글',now()+interval '24 hours') returning id")
        work = [(users[1], "buy"), (users[1], "not"), (users[2], "buy"), (users[2], "buy"), (users[3], "not"), (users[4], "buy")]
        barrier = Barrier(len(work))

        def send(args):
            user, choice = args
            barrier.wait(timeout=30)
            return json.loads(sql(vote(user, post, choice)))

        with ThreadPoolExecutor(max_workers=len(work)) as executor:
            results = list(executor.map(send, work))
        assert all(row["my_choice"] == args[1] for row, args in zip(results, work))
        assert sql(f"select count(*) from private.vote_responses where post_id={post}") == "4"
        assert sql(f"select count(distinct user_id) from private.vote_responses where post_id={post}") == "4"
        # The request starts while open but must be rejected after waiting for the parent lock.
        closing = sql(f"insert into private.posts(author_id,type,content,created_at,ends_at) select '{users[0]}','vote','잠금 대기 마감 테스트',t-interval '24 hours',t from (select clock_timestamp()+interval '2 seconds' t) s returning id")
        holder = subprocess.Popen(command + ["-c", f"begin; select id from private.posts where id={closing} for update; select pg_sleep(3); commit;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8")
        try:
            assert holder.stdout.readline().strip() == closing, "Failed to acquire parent lock"
            rejected = subprocess.run(command + ["-c", vote(users[1], closing, "buy")], capture_output=True, text=True, encoding="utf-8", timeout=15)
            assert rejected.returncode != 0 and "vote_closed" in rejected.stderr, rejected.stderr
        finally:
            holder.communicate(timeout=15)
        assert sql(f"select count(*) from private.vote_responses where post_id={closing}") == "0"
        print("PASS: 6 simultaneous votes retain 4 participant rows; a request crossing the deadline while locked is rejected")
    finally:
        sql(f"delete from auth.users where id in ({ids})")


if __name__ == "__main__":
    main()
