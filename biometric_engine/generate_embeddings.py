from app import BiometricError, generate_pending_embeddings


def main() -> int:
    try:
        summary = generate_pending_embeddings()
    except BiometricError as error:
        print(error.message)
        return 1

    print(
        f"Processed {summary['total']} civilians: "
        f"{summary['generated']} generated, {summary['skipped']} skipped, "
        f"{summary['failed']} failed."
    )

    for failure in summary["failures"]:
        print(f"{failure['full_name']} ({failure['civ_id']}): {failure['message']}")

    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())