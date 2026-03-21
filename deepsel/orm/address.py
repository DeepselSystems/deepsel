from sqlalchemy import Column, String


class AddressMixin(object):
    street = Column(String)
    street2 = Column(String)
    city = Column(String)
    state = Column(String)
    zip = Column(String)
    country = Column(String)
