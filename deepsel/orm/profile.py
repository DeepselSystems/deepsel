from sqlalchemy import Column, String


class ProfileMixin(object):
    name = Column(String)
    last_name = Column(String)
    first_name = Column(String)
    middle_name = Column(String)
    title = Column(String)

    email = Column(String)
    phone = Column(String)
    mobile = Column(String)
    website = Column(String)
