from rest_framework.pagination import PageNumberPagination


class MediaPagination(PageNumberPagination):
    """Page-number pagination that lets the client set the page size.

    ?page_size=<n> overrides the default; max_page_size caps it so a client
    can't request an unbounded page and exhaust the server.
    """

    page_size_query_param = "page_size"
    max_page_size = 100
