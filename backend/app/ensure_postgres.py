"""Create the requested local PostgreSQL database if it does not exist."""
import argparse
import psycopg
from psycopg import sql


def main():
    parser=argparse.ArgumentParser();parser.add_argument("--user",required=True);parser.add_argument("--password",required=True);parser.add_argument("--database",required=True);args=parser.parse_args()
    with psycopg.connect(host="127.0.0.1",port=5432,user=args.user,password=args.password,dbname="postgres",autocommit=True) as connection:
        exists=connection.execute("select 1 from pg_database where datname=%s",(args.database,)).fetchone()
        if not exists:connection.execute(sql.SQL("create database {}").format(sql.Identifier(args.database)))


if __name__=="__main__":main()
