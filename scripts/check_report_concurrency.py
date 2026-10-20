"""Check duplicate report/block requests on an explicitly disposable local DB."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import subprocess
from threading import Barrier
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", required=True)
    container = parser.parse_args().container
    if container != "supabase_db_diggin-112":
        raise SystemExit("Use the disposable diggin-112 database.")
    def sql(statement):
        return subprocess.check_output(["docker","exec",container,"psql","-U","postgres","-d","postgres","-Atq","-v","ON_ERROR_STOP=1","-c",statement],text=True,encoding="utf-8").strip()
    author, viewer = str(uuid4()), str(uuid4())
    sql(f"insert into auth.users(id,email) values ('{author}','{author}@report-race.test'),('{viewer}','{viewer}@report-race.test')")
    try:
        post = sql(f"insert into private.posts(author_id,type,content) values ('{author}','post','동시 신고 테스트 게시글') returning id")
        claims = f"set local role authenticated; set local request.jwt.claims='{{\"sub\":\"{viewer}\",\"role\":\"authenticated\"}}'; "
        barrier = Barrier(4)
        def report(index):
            barrier.wait(timeout=30)
            return sql(claims + f"select public.report_community_content('post',{post},'{['spam','abuse'][index % 2]}');")
        with ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(report,range(4)))
        assert len(set(ids)) == 1, ids
        assert sql(f"select count(*) from private.reports where post_id={post}") == "1"
        barrier = Barrier(4)
        def block(_index):
            barrier.wait(timeout=30)
            sql(claims + f"select public.block_community_author('post',{post});")
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(block,range(4)))
        assert sql(f"select count(*) from private.user_blocks where blocker_id='{viewer}' and blocked_id='{author}'") == "1"
        assert sql(f"select count(*) from private.user_blocks where blocker_id='{author}' and blocked_id='{viewer}'") == "0"
        print("PASS: 4 simultaneous reports retain one original report; 4 block requests retain one one-way relationship")
    finally:
        sql(f"delete from auth.users where id in ('{author}','{viewer}')")


if __name__ == "__main__":
    main()