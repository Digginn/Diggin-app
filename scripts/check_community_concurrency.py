"""Exercise real concurrent RPCs on an explicitly selected disposable local DB."""
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
    if not container.startswith("supabase_db_diggin-97"):
        raise SystemExit("Use the disposable diggin-97 test database.")

    def sql(statement):
        return subprocess.check_output(
            ["docker", "exec", container, "psql", "-U", "postgres", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", statement],
            text=True, encoding="utf-8",
        ).strip()

    users = [str(uuid4()) for _ in range(5)]
    ids = ",".join(f"'{user}'::uuid" for user in users)
    sql("insert into auth.users(id,email) values " + ",".join(f"('{user}','{user}@concurrency.test')" for user in users))
    try:
        post = sql(f"insert into private.posts(author_id,type,content) values ('{users[0]}','post','동시 댓글 테스트 게시글') returning id")
        barrier = Barrier(7)
        duplicate = str(uuid4())
        work = [(users[1], str(uuid4())), (users[1], str(uuid4())), (users[2], str(uuid4())),
                (users[3], str(uuid4())), (users[0], str(uuid4())), (users[4], duplicate), (users[4], duplicate)]

        def create(args):
            user, request = args
            barrier.wait(timeout=30)
            return json.loads(sql(f"set local role authenticated; set local request.jwt.claims='{{\"sub\":\"{user}\",\"role\":\"authenticated\"}}'; select public.create_comment({post},'동시 댓글','{request}');"))

        with ThreadPoolExecutor(max_workers=7) as executor:
            results = list(executor.map(create, work))
        assert results[0]["anon_number"] == results[1]["anon_number"], "Same participant received different anonymous numbers"
        assert results[4]["anon_number"] is None, "Post author consumed an anonymous number"
        assert results[5]["id"] == results[6]["id"], "Concurrent retry created duplicate comments"
        numbers = sorted({row["anon_number"] for row in results if row["anon_number"] is not None})
        assert numbers == [1, 2, 3, 4], numbers
        assert sql(f"select count(*) from private.comments where post_id={post}") == "6"
        assert sql(f"select next_anon_number from private.posts where id={post}") == "5"
        print("PASS: 7 simultaneous requests, 6 comments, 4 stable anonymous numbers, no duplicate retry")
    finally:
        sql(f"delete from auth.users where id in ({ids})")


if __name__ == "__main__":
    main()
