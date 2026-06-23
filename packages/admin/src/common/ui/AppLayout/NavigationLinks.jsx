import NavigationLink from './NavigationLink.jsx';

const NavigationLinks = ({ links, user, opened, toggle }) => {
  const renderNavLinkRecursively = (links) => {
    return links.map((link, index) => (
      <NavigationLink
        key={index}
        link={link}
        index={index}
        user={user}
        opened={opened}
        toggle={toggle}
      >
        {link.children?.length > 0 && renderNavLinkRecursively(link.children)}
      </NavigationLink>
    ));
  };

  return renderNavLinkRecursively(links);
};

export default NavigationLinks;
